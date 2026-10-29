import { and, asc, desc, eq, gt, ilike, or, type SQL, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import type { Attachment, ParsedMail } from "mailparser";
import { nanoid } from "nanoid";
import { attachmentResponse } from "@/app/api/e2/attachments/get";
import { buildRawEmailMessage } from "@/app/api/e2/helper/email-builder";
import {
	type MailboxAccess,
	receivedVisibleTo,
} from "@/app/api/e2/mailboxes/access";
import { recordMailboxActivity } from "@/app/api/e2/mailboxes/activity-log";
import {
	type FolderContext,
	fail,
	handleStateError,
	resolveFolder,
} from "@/app/api/e2/mailboxes/folders";
import {
	addressesOf,
	addressList,
	attachmentInfo,
	fromText,
	iso,
	preview,
} from "@/app/api/e2/mailboxes/messages";
import {
	APPEND_MAX_MESSAGE_BYTES,
	APPENDED_HEADER_SEARCH_CHARS,
	appendedHeadersMatch,
	appendMessage,
	ErrorSchema,
	expungeMessages,
	findFolder,
	folderPathFromParam,
	parseFlags,
	syncFolder,
	transferMessages,
	updateFlags,
} from "@/app/api/e2/mailboxes/state";
import { db } from "@/lib/db";
import type { ImapMailbox } from "@/lib/db/schema";
import {
	imapAppendedMessages,
	imapMailboxExpunges,
	imapMailboxMessages,
	structuredEmails,
} from "@/lib/db/schema";
import { formatMailbox } from "@/lib/email-management/agent-email-helper";
import {
	MailParseLimitError,
	parseMailSafely,
} from "@/lib/email-management/safe-mail-parser";
import { normalizeFlags } from "@/packages/imap-gateway/src/mailbox-rules";

type ElysiaSet = { status?: number | string; headers?: unknown };

export const FolderMessageSummarySchema = t.Object({
	uid: t.Number(),
	folder: t.String(),
	source: t.Union([t.Literal("received"), t.Literal("appended")], {
		description:
			"received: mail delivered to the account (structuredEmailId is set); appended: stored in this mailbox by a client (sent copies, drafts, uploads)",
	}),
	structuredEmailId: t.Nullable(t.String()),
	flags: t.Array(t.String()),
	isRead: t.Boolean(),
	isFlagged: t.Boolean(),
	modseq: t.Number(),
	internalDate: t.String({ format: "date-time" }),
	size: t.Nullable(t.Number()),
	messageId: t.Nullable(t.String()),
	threadId: t.Nullable(t.String()),
	subject: t.Nullable(t.String()),
	from: t.String(),
	to: t.Array(t.String()),
	date: t.Nullable(t.String()),
	preview: t.Nullable(t.String()),
	hasAttachments: t.Boolean(),
});

const AttachmentSummarySchema = t.Object({
	index: t.Number(),
	filename: t.Nullable(t.String()),
	contentType: t.Nullable(t.String()),
	size: t.Nullable(t.Number()),
});

export const FolderMessageDetailSchema = t.Object({
	...FolderMessageSummarySchema.properties,
	inReplyTo: t.Nullable(t.String()),
	references: t.Array(t.String()),
	cc: t.Array(t.String()),
	replyTo: t.Array(t.String()),
	envelopeRecipients: t.Array(t.String()),
	text: t.Nullable(t.String()),
	html: t.Nullable(t.String()),
	attachments: t.Array(AttachmentSummarySchema),
});

const AttachmentPartSchema = t.Object({
	index: t.Number(),
	filename: t.Nullable(t.String()),
	contentType: t.String(),
	size: t.Number(),
	contentId: t.Nullable(t.String()),
	inline: t.Boolean(),
});

const FlagsSchema = t.Object({
	uid: t.Number(),
	folder: t.String(),
	flags: t.Array(t.String()),
});

const errorResponses = {
	400: ErrorSchema,
	401: ErrorSchema,
	403: ErrorSchema,
	404: ErrorSchema,
	409: ErrorSchema,
};

const FolderParams = t.Object({ id: t.String(), folder: t.String() });
const MessageParams = t.Object({
	id: t.String(),
	folder: t.String(),
	uid: t.String(),
});

type MessageRow = typeof imapMailboxMessages.$inferSelect;

function parseUid(value: string): number | null {
	if (!/^\d{1,10}$/.test(value)) return null;
	const uid = Number(value);
	return uid >= 1 && uid <= 2_147_483_647 ? uid : null;
}

function parseCount(value: string | undefined): number | null | undefined {
	if (value === undefined) return undefined;
	if (!/^\d{1,10}$/.test(value)) return null;
	const count = Number(value);
	return count <= 2_147_483_647 ? count : null;
}

function referencesOf(value: string[] | string | undefined): string[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function headerBlock(raw: string): string {
	const crlf = raw.indexOf("\r\n\r\n");
	const lf = raw.indexOf("\n\n");
	const end =
		crlf >= 0 && (lf < 0 || crlf < lf) ? crlf : lf >= 0 ? lf : raw.length;
	return raw.slice(0, end);
}

async function parseHeaders(raw: string | null): Promise<ParsedMail | null> {
	if (!raw) return null;
	try {
		return await parseMailSafely(`${headerBlock(raw)}\r\n\r\n`);
	} catch {
		return null;
	}
}

function flagState(flags: string[]) {
	return {
		flags,
		isRead: flags.includes("\\Seen"),
		isFlagged: flags.includes("\\Flagged"),
	};
}

function baseFields(folder: ImapMailbox, row: MessageRow) {
	const flags = parseFlags(row.flags);
	return {
		uid: row.uid,
		folder: folder.path,
		source: (row.rawSource === "appended" ? "appended" : "received") as
			| "received"
			| "appended",
		structuredEmailId:
			row.rawSource === "appended" ? null : row.structuredEmailId,
		...flagState(flags),
		modseq: row.modseq,
		internalDate: row.internalDate.toISOString(),
		size: row.size,
	};
}

function parsedSummaryFields(parsed: ParsedMail | null) {
	const contentType = parsed?.headers.get("content-type");
	const type =
		typeof contentType === "object" && contentType && "value" in contentType
			? String(contentType.value)
			: "";
	return {
		messageId: parsed?.messageId ?? null,
		threadId: null,
		subject: parsed?.subject ?? null,
		from: addressesOf(parsed?.from)[0] ?? parsed?.from?.text ?? "unknown",
		to: addressesOf(parsed?.to),
		date: iso(parsed?.date),
		preview: null,
		hasAttachments: /^multipart\/mixed/i.test(type),
	};
}

async function loadMessage(
	context: Extract<FolderContext, { ok: true }>,
	uid: number,
): Promise<MessageRow | null> {
	const [row] = await db
		.select()
		.from(imapMailboxMessages)
		.where(
			and(
				eq(imapMailboxMessages.mailboxId, context.folder.id),
				eq(imapMailboxMessages.uid, uid),
			),
		)
		.limit(1);
	return row ?? null;
}

async function loadReceived(access: MailboxAccess, id: string) {
	const [email] = await db
		.select()
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.id, id),
				eq(structuredEmails.userId, access.userId),
			),
		)
		.limit(1);
	return email && receivedVisibleTo(access.credential, email) ? email : null;
}

async function loadRaw(
	access: MailboxAccess,
	row: MessageRow,
): Promise<string | null> {
	if (row.rawSource === "appended") {
		const [appended] = await db
			.select({ rawContent: imapAppendedMessages.rawContent })
			.from(imapAppendedMessages)
			.where(
				and(
					eq(imapAppendedMessages.id, row.structuredEmailId),
					eq(imapAppendedMessages.userId, access.userId),
				),
			)
			.limit(1);
		return appended?.rawContent ?? null;
	}
	const email = await loadReceived(access, row.structuredEmailId);
	return email?.rawContent ?? null;
}

type MessageContext =
	| {
			ok: true;
			context: Extract<FolderContext, { ok: true }>;
			uid: number;
			row: MessageRow;
	  }
	| { ok: false; status: number; error: string };

async function resolveMessage(
	request: Request,
	set: ElysiaSet,
	params: { id: string; folder: string; uid: string },
	options: { write?: boolean } = {},
): Promise<MessageContext> {
	const context = await resolveFolder(
		request,
		set,
		params.id,
		params.folder,
		options,
	);
	if (!context.ok) return context;
	const uid = parseUid(params.uid);
	if (uid === null) {
		return { ok: false, status: 400, error: "UID must be a positive integer" };
	}
	const row = await loadMessage(context, uid);
	if (!row) return { ok: false, status: 404, error: "Message not found" };
	return { ok: true, context, uid, row };
}

function validFlags(
	flags: string[] | undefined,
): { ok: true; flags: string[] } | { ok: false } {
	try {
		return { ok: true, flags: normalizeFlags(flags ?? []) };
	} catch {
		return { ok: false };
	}
}

async function parsedAttachments(
	access: MailboxAccess,
	row: MessageRow,
): Promise<
	| { ok: true; attachments: Attachment[] }
	| { ok: false; status: number; error: string }
> {
	const raw = await loadRaw(access, row);
	if (!raw)
		return { ok: false, status: 404, error: "Message content not available" };
	try {
		const parsed = await parseMailSafely(raw);
		return { ok: true, attachments: parsed.attachments ?? [] };
	} catch (error) {
		if (error instanceof MailParseLimitError) {
			return {
				ok: false,
				status: 422,
				error: `Attachments are not available: ${error.message}`,
			};
		}
		throw error;
	}
}

export const listFolderMessages = new Elysia().get(
	"/mailboxes/:id/folders/:folder/messages",
	async ({ request, params, query, set }) => {
		const context = await resolveFolder(request, set, params.id, params.folder);
		if (!context.ok) return fail(set, context.status, context.error);
		const limit = Math.min(Math.max(Number(query.limit ?? 25) || 25, 1), 100);
		const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
		const sinceModseq = parseCount(query.sinceModseq);
		const sinceUid = parseCount(query.sinceUid);
		if (sinceModseq === null || sinceUid === null) {
			return fail(
				set,
				400,
				"sinceModseq and sinceUid must be non-negative integers",
			);
		}
		if ((sinceModseq !== undefined || sinceUid !== undefined) && offset !== 0) {
			return fail(set, 400, "Incremental sync uses sinceUid for paging, not offset");
		}

		let folder: ImapMailbox;
		try {
			folder = await syncFolder(context.owner, context.folder);
		} catch (error) {
			return handleStateError(set, error);
		}
		if (sinceModseq !== undefined && sinceModseq < folder.expungeFloor) {
			return fail(
				set,
				409,
				"sinceModseq is older than the retained deletion history; list the folder again without it",
			);
		}

		const conditions: SQL[] = [eq(imapMailboxMessages.mailboxId, folder.id)];
		if (sinceModseq !== undefined) {
			conditions.push(gt(imapMailboxMessages.modseq, sinceModseq));
		}
		if (sinceUid !== undefined) {
			conditions.push(gt(imapMailboxMessages.uid, sinceUid));
		}
		if (query.unread === "true") {
			conditions.push(
				sql`NOT jsonb_exists(${imapMailboxMessages.flags}::jsonb, ${"\\Seen"})`,
			);
		}
		if (query.flagged === "true") {
			conditions.push(
				sql`jsonb_exists(${imapMailboxMessages.flags}::jsonb, ${"\\Flagged"})`,
			);
		}
		const search = query.search?.trim();
		if (search) {
			const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
			conditions.push(
				or(
					ilike(structuredEmails.subject, pattern),
					ilike(structuredEmails.fromData, pattern),
					ilike(structuredEmails.toData, pattern),
					appendedHeadersMatch(pattern),
				) as SQL,
			);
		}

		const receivedJoin = and(
			eq(imapMailboxMessages.rawSource, "structured"),
			eq(structuredEmails.id, imapMailboxMessages.structuredEmailId),
			eq(structuredEmails.userId, context.owner.userId),
		);
		const appendedJoin = and(
			eq(imapMailboxMessages.rawSource, "appended"),
			eq(imapAppendedMessages.id, imapMailboxMessages.structuredEmailId),
			eq(imapAppendedMessages.userId, context.owner.userId),
		);
		const incremental = sinceModseq !== undefined || sinceUid !== undefined;

		const [rows, totals, expunged] = await Promise.all([
			db
				.select({
					message: imapMailboxMessages,
					subject: structuredEmails.subject,
					fromData: structuredEmails.fromData,
					toData: structuredEmails.toData,
					date: structuredEmails.date,
					createdAt: structuredEmails.createdAt,
					threadId: structuredEmails.threadId,
					messageId: structuredEmails.messageId,
					textPreview: sql<
						string | null
					>`left(${structuredEmails.textBody}, 2000)`,
					htmlPreview: sql<
						string | null
					>`left(${structuredEmails.htmlBody}, 8000)`,
					attachments: structuredEmails.attachments,
					appendedHead: sql<
						string | null
					>`left(${imapAppendedMessages.rawContent}, ${APPENDED_HEADER_SEARCH_CHARS}::integer)`,
				})
				.from(imapMailboxMessages)
				.leftJoin(structuredEmails, receivedJoin)
				.leftJoin(imapAppendedMessages, appendedJoin)
				.where(and(...conditions))
				.orderBy(
					incremental
						? asc(imapMailboxMessages.uid)
						: desc(imapMailboxMessages.uid),
				)
				.limit(limit)
				.offset(offset),
			db
				.select({ count: sql<number>`count(*)::int` })
				.from(imapMailboxMessages)
				.leftJoin(structuredEmails, receivedJoin)
				.leftJoin(imapAppendedMessages, appendedJoin)
				.where(and(...conditions)),
			sinceModseq === undefined
				? Promise.resolve([] as Array<{ uid: number }>)
				: db
						.select({ uid: imapMailboxExpunges.uid })
						.from(imapMailboxExpunges)
						.where(
							and(
								eq(imapMailboxExpunges.mailboxId, folder.id),
								gt(imapMailboxExpunges.modseq, sinceModseq),
							),
						)
						.orderBy(asc(imapMailboxExpunges.uid)),
		]);

		const data = await Promise.all(
			rows.map(async (row) => {
				const base = baseFields(folder, row.message);
				if (row.message.rawSource === "appended") {
					return {
						...base,
						...parsedSummaryFields(await parseHeaders(row.appendedHead)),
					};
				}
				return {
					...base,
					messageId: row.messageId,
					threadId: row.threadId,
					subject: row.subject,
					from: fromText(row.fromData),
					to: addressList(row.toData),
					date: iso(row.date ?? row.createdAt),
					preview: preview(row.textPreview, row.htmlPreview),
					hasAttachments: attachmentInfo(row.attachments).length > 0,
				};
			}),
		);
		const total = Number(totals[0]?.count ?? 0);
		return {
			folder: folder.path,
			uidValidity: folder.uidValidity,
			uidNext: folder.uidNext,
			highestModseq: folder.modseq,
			expunged: expunged.map((row) => row.uid),
			data,
			pagination: {
				limit,
				offset,
				total,
				hasMore: offset + data.length < total,
			},
		};
	},
	{
		params: FolderParams,
		query: t.Object({
			limit: t.Optional(t.String({ description: "1-100, default 25" })),
			offset: t.Optional(t.String({ description: "Default 0" })),
			sinceModseq: t.Optional(
				t.String({
					description:
						"Only messages added or changed after this modseq (a previous response's highestModseq). Also returns UIDs removed since then in `expunged`. Results are ordered by UID ascending.",
				}),
			),
			sinceUid: t.Optional(
				t.String({
					description:
						"Only messages with a greater UID. Results are ordered by UID ascending.",
				}),
			),
			unread: t.Optional(
				t.String({ description: "'true' for messages without \\Seen" }),
			),
			flagged: t.Optional(
				t.String({ description: "'true' for messages with \\Flagged" }),
			),
			search: t.Optional(
				t.String({
					description:
						"Match subject, sender or recipients (received mail) or the raw header block (appended mail; bodies are not searched)",
				}),
			),
		}),
		response: {
			200: t.Object({
				folder: t.String(),
				uidValidity: t.Number(),
				uidNext: t.Number(),
				highestModseq: t.Number(),
				expunged: t.Array(t.Number(), {
					description:
						"UIDs removed after sinceModseq (empty without sinceModseq)",
				}),
				data: t.Array(FolderMessageSummarySchema),
				pagination: t.Object({
					limit: t.Number(),
					offset: t.Number(),
					total: t.Number(),
					hasMore: t.Boolean(),
				}),
			}),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "List folder messages",
			description:
				"List the messages in a folder, newest UID first (UID ascending when sinceModseq or sinceUid is set). The same state IMAP clients see: flags, UIDs and moves are shared.",
		},
	},
);

export const getFolderMessage = new Elysia().get(
	"/mailboxes/:id/folders/:folder/messages/:uid",
	async ({ request, params, set }) => {
		const resolved = await resolveMessage(request, set, params);
		if (!resolved.ok) return fail(set, resolved.status, resolved.error);
		const { context, row } = resolved;
		const base = baseFields(context.folder, row);
		if (row.rawSource !== "appended") {
			const email = await loadReceived(context.access, row.structuredEmailId);
			if (!email) return fail(set, 404, "Message not found");
			return {
				...base,
				messageId: email.messageId,
				threadId: email.threadId,
				subject: email.subject,
				from: fromText(email.fromData),
				to: addressList(email.toData),
				date: iso(email.date ?? email.createdAt),
				preview: preview(email.textBody, email.htmlBody),
				hasAttachments: attachmentInfo(email.attachments).length > 0,
				inReplyTo: email.inReplyTo,
				references: referencesFromJson(email.references),
				cc: addressList(email.ccData),
				replyTo: addressList(email.replyToData),
				envelopeRecipients:
					email.envelopeRecipients ??
					(email.recipient ? [email.recipient] : []),
				text: email.textBody,
				html: email.htmlBody,
				attachments: attachmentInfo(email.attachments),
			};
		}
		const raw = await loadRaw(context.access, row);
		if (!raw) return fail(set, 404, "Message content not available");
		let parsed: ParsedMail;
		try {
			parsed = await parseMailSafely(raw);
		} catch (error) {
			if (error instanceof MailParseLimitError) {
				return fail(set, 422, `Message could not be parsed: ${error.message}`);
			}
			throw error;
		}
		const attachments = (parsed.attachments ?? []).map((attachment, index) => ({
			index,
			filename: attachment.filename || null,
			contentType: attachment.contentType || null,
			size: attachment.size ?? attachment.content?.length ?? null,
		}));
		return {
			...base,
			...parsedSummaryFields(parsed),
			preview: preview(
				parsed.text || null,
				typeof parsed.html === "string" ? parsed.html : null,
			),
			hasAttachments: attachments.length > 0,
			inReplyTo: parsed.inReplyTo ?? null,
			references: referencesOf(parsed.references),
			cc: addressesOf(parsed.cc),
			replyTo: addressesOf(parsed.replyTo),
			envelopeRecipients: [],
			text: parsed.text ?? null,
			html: typeof parsed.html === "string" ? parsed.html : null,
			attachments,
		};
	},
	{
		params: MessageParams,
		response: {
			200: FolderMessageDetailSchema,
			...errorResponses,
			422: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Get a folder message",
			description:
				"Get a message by folder and UID, with its parsed headers, bodies, flags and attachment list.",
		},
	},
);

function referencesFromJson(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		if (Array.isArray(parsed)) {
			return parsed.filter(
				(entry): entry is string => typeof entry === "string",
			);
		}
		return typeof parsed === "string" ? [parsed] : [];
	} catch {
		return value.split(/\s+/).filter(Boolean);
	}
}

export const getFolderMessageRaw = new Elysia().get(
	"/mailboxes/:id/folders/:folder/messages/:uid/raw",
	async ({ request, params, set }) => {
		const resolved = await resolveMessage(request, set, params);
		if (!resolved.ok) return fail(set, resolved.status, resolved.error);
		const raw = await loadRaw(resolved.context.access, resolved.row);
		if (!raw) return fail(set, 404, "Message content not available");
		const bytes = Buffer.from(raw, "utf8");
		return new Response(new Uint8Array(bytes), {
			status: 200,
			headers: {
				"Content-Type": "message/rfc822",
				"Content-Disposition": `attachment; filename="message-${resolved.uid}.eml"`,
				"Content-Length": bytes.length.toString(),
				"Cache-Control": "private, no-store",
			},
		});
	},
	{
		params: MessageParams,
		detail: {
			tags: ["Mailboxes"],
			summary: "Download a folder message's raw source",
			description:
				"Returns the full RFC 822 message (`message/rfc822`), exactly as IMAP serves it. A 200 response is the binary message, not JSON.",
			responses: {
				200: {
					description: "Raw RFC 822 message",
					content: { "message/rfc822": { schema: { type: "string", format: "binary" } } },
				},
				...Object.fromEntries(Object.keys(errorResponses).map((status) => [status, {
					description: "Mailbox request failed",
					content: { "application/json": { schema: ErrorSchema } },
				}])),
			},
		},
	},
);

export const listFolderMessageAttachments = new Elysia().get(
	"/mailboxes/:id/folders/:folder/messages/:uid/attachments",
	async ({ request, params, set }) => {
		const resolved = await resolveMessage(request, set, params);
		if (!resolved.ok) return fail(set, resolved.status, resolved.error);
		const loaded = await parsedAttachments(
			resolved.context.access,
			resolved.row,
		);
		if (!loaded.ok) return fail(set, loaded.status, loaded.error);
		return {
			data: loaded.attachments.map((attachment, index) => ({
				index,
				filename: attachment.filename || null,
				contentType: attachment.contentType || "application/octet-stream",
				size: attachment.content.length,
				contentId: attachment.contentId || null,
				inline:
					attachment.contentDisposition === "inline" ||
					attachment.related === true,
			})),
		};
	},
	{
		params: MessageParams,
		response: {
			200: t.Object({ data: t.Array(AttachmentPartSchema) }),
			...errorResponses,
			422: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "List a folder message's attachments",
			description:
				"List every attachment of a received or appended message, parsed from its raw source.",
		},
	},
);

export const getFolderMessageAttachment = new Elysia().get(
	"/mailboxes/:id/folders/:folder/messages/:uid/attachments/:index",
	async ({ request, params, set }) => {
		const resolved = await resolveMessage(request, set, params);
		if (!resolved.ok) return fail(set, resolved.status, resolved.error);
		if (!/^\d{1,6}$/.test(params.index)) {
			return fail(set, 400, "Attachment index must be a non-negative integer");
		}
		const loaded = await parsedAttachments(
			resolved.context.access,
			resolved.row,
		);
		if (!loaded.ok) return fail(set, loaded.status, loaded.error);
		const index = Number(params.index);
		const attachment = loaded.attachments[index];
		if (!attachment) return fail(set, 404, "Attachment not found");
		return attachmentResponse(attachment, `attachment-${index + 1}`);
	},
	{
		params: t.Object({
			id: t.String(),
			folder: t.String(),
			uid: t.String(),
			index: t.String(),
		}),
		detail: {
			tags: ["Mailboxes"],
			summary: "Download a folder message's attachment",
			description:
				"Download an attachment by its 0-based position in the attachment list. A 200 response is the binary attachment with its own content type, not JSON.",
			responses: {
				200: {
					description: "Attachment bytes (Content-Type identifies the attachment format)",
					content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
				},
				...Object.fromEntries([...Object.keys(errorResponses), "422"].map((status) => [status, {
					description: "Mailbox request failed",
					content: { "application/json": { schema: ErrorSchema } },
				}])),
			},
		},
	},
);

export const updateFolderMessageFlags = new Elysia().patch(
	"/mailboxes/:id/folders/:folder/messages/:uid",
	async ({ request, params, body, set }) => {
		const resolved = await resolveMessage(request, set, params, {
			write: true,
		});
		if (!resolved.ok) return fail(set, resolved.status, resolved.error);
		const flagList = validFlags(body.flags);
		if (!flagList.ok) return fail(set, 400, "Invalid message flag");
		const { context, uid } = resolved;
		try {
			const updated = await updateFlags(
				context.owner,
				context.folder.id,
				[uid],
				body.action,
				flagList.flags,
			);
			if (!updated[0]) return fail(set, 404, "Message not found");
			return { uid, folder: context.folder.path, flags: updated[0].flags };
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: MessageParams,
		body: t.Object({
			action: t.Union(
				[t.Literal("add"), t.Literal("remove"), t.Literal("set")],
				{
					description:
						"add or remove the given flags, or replace all flags (set)",
				},
			),
			flags: t.Array(t.String({ minLength: 1, maxLength: 255 }), {
				maxItems: 50,
			}),
		}),
		response: { 200: FlagsSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Update a folder message's flags",
			description:
				"Requires a read_write mailbox. Works like IMAP STORE, for example `\\Seen`, `\\Flagged`, `\\Answered`, `\\Deleted`, `\\Draft` or a keyword. Flags of received mail are shared between INBOX and the scope folders.",
		},
	},
);

const TransferResultSchema = t.Object({
	source: t.String(),
	sourceUid: t.Number(),
	destination: t.String(),
	destinationUid: t.Number({
		description: "UID in the destination, including an existing copy's UID",
	}),
	uidValidity: t.Number({ description: "The destination's UID validity" }),
});

const TransferBody = t.Object({
	destination: t.String({
		minLength: 1,
		maxLength: 255,
		description:
			"Destination folder path (not URL-encoded), for example `Archive`",
	}),
});

async function transfer(
	kind: "move" | "copy",
	request: Request,
	set: ElysiaSet,
	params: { id: string; folder: string; uid: string },
	body: { destination: string },
) {
	const resolved = await resolveMessage(request, set, params, { write: true });
	if (!resolved.ok) return fail(set, resolved.status, resolved.error);
	const { context, uid } = resolved;
	const destinationPath = folderPathFromParam(body.destination);
	if (!destinationPath)
		return fail(set, 400, "Invalid destination folder path");
	try {
		const destination = await findFolder(context.owner, destinationPath);
		if (!destination) return fail(set, 404, "Destination folder not found");
		const pairs = await transferMessages(
			context.owner,
			context.folder.id,
			destination.id,
			[uid],
			kind === "move",
		);
		if (!pairs[0]) return fail(set, 404, "Message not found");
		set.status = kind === "copy" ? 201 : 200;
		return {
			source: context.folder.path,
			sourceUid: uid,
			destination: destination.path,
			destinationUid: pairs[0].destinationUid,
			uidValidity: destination.uidValidity,
		};
	} catch (error) {
		return handleStateError(set, error);
	}
}

export const moveFolderMessage = new Elysia().post(
	"/mailboxes/:id/folders/:folder/messages/:uid/move",
	({ request, params, body, set }) =>
		transfer("move", request, set, params, body),
	{
		params: MessageParams,
		body: TransferBody,
		response: { 200: TransferResultSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Move a folder message",
			description:
				"Requires a read_write mailbox. Moves the message to another folder, like IMAP MOVE. Moving received mail to Junk or INBOX marks it as junk or not junk for this mailbox only; the account-level verdict is unchanged.",
		},
	},
);

export const copyFolderMessage = new Elysia().post(
	"/mailboxes/:id/folders/:folder/messages/:uid/copy",
	({ request, params, body, set }) =>
		transfer("copy", request, set, params, body),
	{
		params: MessageParams,
		body: TransferBody,
		response: { 201: TransferResultSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Copy a folder message",
			description:
				"Requires a read_write mailbox. Copies the message to another folder, like IMAP COPY. Copying received mail to Junk or INBOX marks it as junk or not junk for this mailbox only; the account-level verdict is unchanged.",
		},
	},
);

export const deleteFolderMessage = new Elysia().delete(
	"/mailboxes/:id/folders/:folder/messages/:uid",
	async ({ request, params, query, set }) => {
		const resolved = await resolveMessage(request, set, params, {
			write: true,
		});
		if (!resolved.ok) return fail(set, resolved.status, resolved.error);
		const { context, uid } = resolved;
		try {
			if (query.permanent === "true" || context.folder.path === "Trash") {
				await expungeMessages(context.owner, context.folder.id, [uid], true);
				return { uid, permanent: true, trashUid: null };
			}
			const trash = await findFolder(context.owner, "Trash");
			if (!trash) return fail(set, 404, "Trash folder not found");
			const pairs = await transferMessages(
				context.owner,
				context.folder.id,
				trash.id,
				[uid],
				true,
			);
			if (!pairs[0]) return fail(set, 404, "Message not found");
			return {
				uid,
				permanent: false,
				trashUid: pairs[0].destinationUid,
			};
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: MessageParams,
		query: t.Object({
			permanent: t.Optional(
				t.String({
					description:
						"'true' to remove permanently instead of moving to Trash",
				}),
			),
		}),
		response: {
			200: t.Object({
				uid: t.Number(),
				permanent: t.Boolean(),
				trashUid: t.Nullable(t.Number()),
			}),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Delete a folder message",
			description:
				"Requires a read_write mailbox. Moves the message to Trash, or removes it permanently when `permanent=true` or it is already in Trash. Received mail stays in the account and the dashboard.",
		},
	},
);

function draftFromAddress(access: MailboxAccess): string {
	const { credential } = access;
	const address = credential.sendingAddress ?? credential.loginAddress;
	return formatMailbox({ name: credential.sendingName, address });
}

function toList(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return (Array.isArray(value) ? value : [value]).filter((entry) =>
		entry.trim(),
	);
}

const AddressListInput = t.Union([
	t.String({ maxLength: 4096 }),
	t.Array(t.String({ maxLength: 512 }), { maxItems: 100 }),
]);

export const appendFolderMessage = new Elysia().post(
	"/mailboxes/:id/folders/:folder/messages",
	async ({ request, params, body, set }) => {
		const context = await resolveFolder(
			request,
			set,
			params.id,
			params.folder,
			{
				write: true,
			},
		);
		if (!context.ok) return fail(set, context.status, context.error);
		if (context.folder.scopeId)
			return fail(set, 403, "Scope folders are read-only");
		const draftFields = [
			body.from,
			body.to,
			body.cc,
			body.replyTo,
			body.subject,
			body.text,
			body.html,
			body.headers,
			body.inReplyTo,
			body.references,
		];
		const isDraft = draftFields.some((value) => value !== undefined);
		if (body.raw !== undefined && isDraft) {
			return fail(set, 400, "Provide either raw or message fields, not both");
		}
		if (body.raw === undefined && !isDraft) {
			return fail(set, 400, "Provide raw (base64) or message fields");
		}
		const flags = validFlags(body.flags);
		if (!flags.ok) return fail(set, 400, "Invalid message flag");
		let date = new Date();
		if (body.date !== undefined) {
			date = new Date(body.date);
			if (Number.isNaN(date.getTime())) return fail(set, 400, "Invalid date");
		}

		let raw: string;
		if (body.raw !== undefined) {
			const compact = body.raw.replace(/\s+/g, "");
			if (
				!compact ||
				!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) ||
				compact.length % 4 === 1
			) {
				return fail(set, 400, "raw must be base64-encoded");
			}
			const bytes = Buffer.from(compact, "base64");
			if (bytes.length > APPEND_MAX_MESSAGE_BYTES) {
				return fail(
					set,
					413,
					`Message is larger than ${APPEND_MAX_MESSAGE_BYTES} bytes`,
				);
			}
			try {
				raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
			} catch {
				return fail(
					set,
					400,
					"raw must be UTF-8 text; encode 8-bit parts with base64 or quoted-printable",
				);
			}
		} else {
			try {
				raw = buildRawEmailMessage({
					from: body.from ?? draftFromAddress(context.access),
					to: toList(body.to),
					cc: toList(body.cc),
					replyTo: toList(body.replyTo),
					subject: body.subject ?? "",
					textBody: body.text,
					htmlBody: body.html,
					messageId: `${nanoid()}@${context.access.credential.loginAddress.split("@")[1]}`,
					inReplyTo: body.inReplyTo,
					references: body.references,
					date,
					customHeaders: body.headers,
				});
			} catch (error) {
				return fail(
					set,
					400,
					error instanceof Error ? error.message : "Invalid message",
				);
			}
			if (Buffer.byteLength(raw) > APPEND_MAX_MESSAGE_BYTES) {
				return fail(
					set,
					413,
					`Message is larger than ${APPEND_MAX_MESSAGE_BYTES} bytes`,
				);
			}
		}
		if (raw.includes("\u0000"))
			return fail(set, 400, "Message must not contain NUL bytes");

		const messageFlags =
			body.flags !== undefined
				? flags.flags
				: isDraft
					? context.folder.path === "Drafts"
						? ["\\Seen", "\\Draft"]
						: ["\\Seen"]
					: [];
		try {
			const appended = await appendMessage(
				context.owner,
				context.folder.id,
				raw,
				messageFlags,
				date,
			);
			set.status = 201;
			return {
				folder: context.folder.path,
				uid: appended.uid,
				uidValidity: appended.uidValidity,
			};
		} catch (error) {
			const response = handleStateError(set, error);
			const use = context.access.credential.use;
			if (set.status === 413 && use) {
				await recordMailboxActivity({
					userId: context.access.userId,
					credentialId: context.access.credential.credentialId,
					protocol: use.protocol,
					event: "quota_exceeded",
					reason: "storage_quota",
					clientIp: use.clientIp,
					client: use.client,
					detail: {
						limit: context.access.credential.storageQuotaBytes ?? 0,
					},
				});
			}
			return response;
		}
	},
	{
		params: FolderParams,
		body: t.Object({
			raw: t.Optional(
				t.String({
					maxLength: Math.ceil(APPEND_MAX_MESSAGE_BYTES / 3) * 4 + 4096,
					description:
						"The full RFC 822 message, base64-encoded. The decoded message must be valid UTF-8 (7-bit or UTF-8 headers and bodies); encode other 8-bit content with base64 or quoted-printable.",
				}),
			),
			from: t.Optional(
				t.String({
					maxLength: 512,
					description:
						"Defaults to the mailbox's sending identity or login address",
				}),
			),
			to: t.Optional(AddressListInput),
			cc: t.Optional(AddressListInput),
			replyTo: t.Optional(AddressListInput),
			subject: t.Optional(t.String({ maxLength: 998 })),
			text: t.Optional(t.String()),
			html: t.Optional(t.String()),
			headers: t.Optional(t.Record(t.String(), t.String())),
			inReplyTo: t.Optional(t.String({ maxLength: 998 })),
			references: t.Optional(
				t.Array(t.String({ maxLength: 998 }), { maxItems: 100 }),
			),
			flags: t.Optional(
				t.Array(t.String({ maxLength: 255 }), {
					maxItems: 50,
					description:
						"Defaults to none for raw messages, and to \\Seen (plus \\Draft in Drafts) for message fields",
				}),
			),
			date: t.Optional(
				t.String({ description: "Internal date (ISO 8601); defaults to now" }),
			),
		}),
		response: {
			201: t.Object({
				folder: t.String(),
				uid: t.Number(),
				uidValidity: t.Number(),
			}),
			...errorResponses,
			413: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Add a message to a folder",
			description:
				"Requires a read_write mailbox. Stores a message in a folder, like IMAP APPEND: either a raw RFC 822 message (base64) or message fields that are built into one (for example a draft). Nothing is sent. Size and storage limits are the same as over IMAP. Appending to Sent with a Message-ID that is already there returns the existing message.",
		},
	},
);
