import { randomUUID } from "node:crypto";

export type LocalSentMessage = {
	messageId: string;
	from: string;
	recipients: string[];
	raw: string;
	sentAt: string;
	deliveries: Array<{ recipients: string[]; status: number; body: string }>;
};

type SendEmailRequest = {
	FromEmailAddress?: string;
	Destination?: {
		ToAddresses?: string[];
		CcAddresses?: string[];
		BccAddresses?: string[];
	};
	Content?: {
		Raw?: { Data?: string };
		Simple?: {
			Subject?: { Data?: string };
			Body?: { Text?: { Data?: string }; Html?: { Data?: string } };
		};
	};
};

function headerValue(raw: string, name: string) {
	const headerBlock = raw.split(/\r?\n\r?\n/, 1)[0] ?? "";
	const match = headerBlock.match(new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, "im"));
	return match ? match[1].replace(/\r?\n[ \t]+/g, " ").trim() : null;
}

function simpleToRaw(from: string, recipients: string[], simple: NonNullable<SendEmailRequest["Content"]>["Simple"]) {
	const subject = simple?.Subject?.Data ?? "";
	const text = simple?.Body?.Text?.Data ?? "";
	return [`From: ${from}`, `To: ${recipients.join(", ")}`, `Subject: ${subject}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", text].join("\r\n");
}

export function buildSesInboundPayload(options: {
	raw: string;
	recipients: string[];
	sesMessageId: string;
	source?: string;
}) {
	const nowIso = new Date().toISOString();
	const from = headerValue(options.raw, "From") ?? options.source ?? "unknown@localhost";
	const subject = headerValue(options.raw, "Subject") ?? "";
	const messageId = headerValue(options.raw, "Message-ID") ?? `<${options.sesMessageId}@local.test>`;
	const to = headerValue(options.raw, "To") ?? options.recipients.join(", ");
	const sender = options.source ?? from;

	return {
		type: "ses_event_with_content",
		timestamp: nowIso,
		originalEvent: { Records: [] },
		processedRecords: [
			{
				eventSource: "aws:ses",
				eventVersion: "1.0",
				ses: {
					mail: {
						timestamp: nowIso,
						source: sender,
						messageId: options.sesMessageId,
						destination: options.recipients,
						headers: [
							{ name: "From", value: from },
							{ name: "To", value: to },
							{ name: "Subject", value: subject },
							{ name: "Message-ID", value: messageId },
						],
						commonHeaders: {
							from: [from],
							to: [to],
							subject,
							messageId,
							date: new Date(nowIso).toUTCString(),
						},
					},
					receipt: {
						timestamp: nowIso,
						processingTimeMillis: 50,
						recipients: options.recipients,
						spamVerdict: { status: "PASS" },
						virusVerdict: { status: "PASS" },
						spfVerdict: { status: "PASS" },
						dkimVerdict: { status: "PASS" },
						dmarcVerdict: { status: "PASS" },
						action: { type: "S3", bucketName: "", objectKey: "" },
					},
				},
				emailContent: options.raw,
			},
		],
		context: {
			functionName: "inbound-local-mail-server",
			functionVersion: "1",
			requestId: randomUUID(),
		},
	};
}

export async function deliverInbound(options: {
	inboundWebhookUrl: string;
	serviceApiKey: string;
	raw: string;
	recipients: string[];
	sesMessageId?: string;
	source?: string;
}) {
	const payload = buildSesInboundPayload({
		raw: options.raw,
		recipients: options.recipients,
		sesMessageId: options.sesMessageId ?? `local-${randomUUID()}`,
		source: options.source,
	});
	const response = await fetch(options.inboundWebhookUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${options.serviceApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});
	return { status: response.status, body: await response.text() };
}

export function startLocalMailServer(options: {
	port: number;
	inboundWebhookUrl: string;
	serviceApiKey: string;
	log?: (message: string) => void;
}) {
	const messages: LocalSentMessage[] = [];
	const log = options.log ?? (() => {});
	let failNextSends = 0;

	const server = Bun.serve({
		port: options.port,
		hostname: "127.0.0.1",
		async fetch(request) {
			const url = new URL(request.url);

			if (request.method === "GET" && url.pathname === "/_local/messages") {
				return Response.json(messages);
			}

			if (request.method === "POST" && url.pathname === "/_local/fail-next") {
				failNextSends += Number(url.searchParams.get("count") ?? "1");
				return Response.json({ failNextSends });
			}

			if (request.method === "POST" && url.pathname === "/v2/email/outbound-emails") {
				if (failNextSends > 0) {
					failNextSends -= 1;
					return Response.json(
						{ __type: "MessageRejected", message: "Local SES stub rejected this send (fail-next)" },
						{ status: 400, headers: { "x-amzn-ErrorType": "MessageRejected" } },
					);
				}
				const body = (await request.json()) as SendEmailRequest;
				const from = body.FromEmailAddress ?? "unknown@localhost";
				const recipients = [
					...(body.Destination?.ToAddresses ?? []),
					...(body.Destination?.CcAddresses ?? []),
					...(body.Destination?.BccAddresses ?? []),
				];
				const messageId = `local-${randomUUID()}`;
				let raw = body.Content?.Raw?.Data
					? Buffer.from(body.Content.Raw.Data, "base64").toString("utf8")
					: simpleToRaw(from, recipients, body.Content?.Simple);
				if (!headerValue(raw, "Message-ID")) {
					raw = `Message-ID: <${messageId}@us-east-2.amazonses.com>\r\n${raw}`;
				}

				const message: LocalSentMessage = {
					messageId,
					from,
					recipients,
					raw,
					sentAt: new Date().toISOString(),
					deliveries: [],
				};
				messages.push(message);
				log(`📨 [local mail] ${from} -> ${recipients.join(", ")} (${messageId})`);

				queueMicrotask(async () => {
					try {
						const delivery = await deliverInbound({
							inboundWebhookUrl: options.inboundWebhookUrl,
							serviceApiKey: options.serviceApiKey,
							raw,
							recipients,
							source: from,
						});
						message.deliveries.push({ recipients, ...delivery });
					} catch (error) {
						message.deliveries.push({
							recipients,
							status: 0,
							body: error instanceof Error ? error.message : String(error),
						});
					}
				});

				return Response.json({ MessageId: messageId });
			}

			log(`⚠️ [local mail] Unsupported AWS request: ${request.method} ${url.pathname}`);
			return Response.json(
				{ __type: "NotImplemented", message: `Local AWS stub does not implement ${request.method} ${url.pathname}` },
				{ status: 501 },
			);
		},
	});

	return { server, messages, stop: () => server.stop(true) };
}
