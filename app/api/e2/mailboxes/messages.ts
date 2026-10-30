import { and, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import type { AddressObject, ParsedMail } from "mailparser";
import { attachmentResponse } from "@/app/api/e2/attachments/get";
import {
	authorizeMailboxAccess,
	canWrite,
	type MailboxAccess,
	receivedVisibleSql,
	receivedVisibleTo,
	sentVisibleSql,
} from "@/app/api/e2/mailboxes/access";
import { handleStateError, ownerOf } from "@/app/api/e2/mailboxes/folders";
import {
	APPENDED_HEADER_SEARCH_CHARS,
	appendedHeadersMatch,
	findFolder,
	type MailboxOwnerRef,
	parseFlags,
	syncFolder,
	transferMessages,
	updateFlags,
} from "@/app/api/e2/mailboxes/state";
import { db } from "@/lib/db";
import type { ImapMailbox } from "@/lib/db/schema";
import {
	imapAppendedMessages,
	imapMailboxes,
	imapMailboxMessages,
	sentEmails,
	structuredEmails,
} from "@/lib/db/schema";
import { formatMailbox } from "@/lib/email-management/agent-email-helper";
import { resolveStructuredEmailId } from "@/lib/email-management/email-aliases";
import {
	MailParseLimitError,
	parseMailSafely,
} from "@/lib/email-management/safe-mail-parser";
import { loadStoredAttachments } from "@/lib/email-management/stored-attachments";

const ErrorSchema = t.Object({ error: t.String() });

const MailboxProfileSchema = t.Object({
	id: t.String(),
	loginAddress: t.String(),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	sendingMode: t.Union([t.Literal("identity"), t.Literal("scoped_domains")]),
	sendingName: t.Nullable(t.String()),
	sendingAddress: t.Nullable(t.String()),
	allowedSendingDomains: t.Array(t.String()),
	scopes: t.Array(
		t.Object({
			type: t.Union([t.Literal("domain"), t.Literal("address")]),
			domain: t.String(),
			address: t.Nullable(t.String()),
		}),
	),
	protocols: t.Object({ imap: t.Boolean(), smtp: t.Boolean(), api: t.Boolean() }),
	allowedIps: t.Array(t.String()),
	storageQuotaBytes: t.Nullable(t.Number()),
	dailySendLimit: t.Nullable(t.Integer()),
	selfService: t.Object({
		filters: t.Boolean(),
		spam: t.Boolean(),
		password: t.Boolean(),
		activity: t.Boolean(),
	}),
	unreadCount: t.Number(),
	authenticatedAs: t.Union([t.Literal("account"), t.Literal("mailbox")]),
});

const MessageSummarySchema = t.Object({
	id: t.String(),
	folder: t.Union(
		[
			t.Literal("inbox"),
			t.Literal("archive"),
			t.Literal("junk"),
			t.Literal("sent"),
		],
		{
			description:
				"The message's folder group: inbox (INBOX and scope folders), junk, sent (Sent, Drafts and messages stored by clients) or archive (Archive and other folders holding received mail). folderPath has the exact folder.",
		},
	),
	folderPath: t.Nullable(
		t.String({
			description:
				"The exact mailbox folder path (for example `Trash` or `Projects/2026`), shared with IMAP and /mailboxes/{id}/folders; null when the message isn't in a folder of this mailbox",
		}),
	),
	threadId: t.Nullable(t.String()),
	subject: t.Nullable(t.String()),
	from: t.String(),
	to: t.Array(t.String()),
	date: t.Nullable(t.String()),
	preview: t.Nullable(t.String()),
	isRead: t.Boolean(),
	isJunk: t.Boolean(),
	hasAttachments: t.Boolean(),
});

const AttachmentInfoSchema = t.Object({
	index: t.Number(),
	filename: t.Nullable(t.String()),
	contentType: t.Nullable(t.String()),
	size: t.Nullable(t.Number()),
});

const MessageDetailSchema = t.Object({
	...MessageSummarySchema.properties,
	messageId: t.Nullable(t.String()),
	inReplyTo: t.Nullable(t.String()),
	cc: t.Array(t.String()),
	replyTo: t.Array(t.String()),
	envelopeRecipients: t.Array(t.String()),
	text: t.Nullable(t.String()),
	html: t.Nullable(t.String()),
	attachments: t.Array(AttachmentInfoSchema),
	status: t.Optional(t.String()),
});

type Folder = "inbox" | "archive" | "junk" | "sent";
type ListFolder = Folder;

const LIST_FOLDER_PATHS: Record<ListFolder, string> = {
	inbox: "INBOX",
	archive: "Archive",
	junk: "Junk",
	sent: "Sent",
};

function legacyFolder(
	folder: Pick<ImapMailbox, "path" | "scopeId">,
	appended: boolean,
): Folder {
	if (folder.scopeId || folder.path === "INBOX") return "inbox";
	switch (folder.path) {
		case "Archive":
			return "archive";
		case "Junk":
			return "junk";
		case "Sent":
		case "Drafts":
			return "sent";
		default:
			return appended ? "sent" : "archive";
	}
}

type Location = { folder: ImapMailbox; uid: number; flags: string[] };

const LOCATION_RANK = ["INBOX", "Junk", "Archive", "Sent", "Drafts", "Trash"];

function locationRank(folder: ImapMailbox): number {
	if (folder.scopeId) return LOCATION_RANK.length + 1;
	const rank = LOCATION_RANK.indexOf(folder.path);
	return rank < 0 ? LOCATION_RANK.length : rank;
}

/**
 * Finds where messages are in the mailbox's folders, preferring INBOX, Junk,
 * Archive, Sent, Drafts and Trash, then user folders, then read-only scope
 * folders.
 */
async function locateMany(
	owner: MailboxOwnerRef,
	ids: string[],
	rawSource: "structured" | "appended",
): Promise<Map<string, Location>> {
	const located = new Map<string, Location>();
	if (ids.length === 0) return located;
	const rows = await db
		.select({ message: imapMailboxMessages, folder: imapMailboxes })
		.from(imapMailboxMessages)
		.innerJoin(
			imapMailboxes,
			eq(imapMailboxes.id, imapMailboxMessages.mailboxId),
		)
		.where(
			and(
				eq(imapMailboxes.userId, owner.userId),
				eq(imapMailboxes.credentialId, owner.credentialId),
				eq(imapMailboxMessages.rawSource, rawSource),
				inArray(imapMailboxMessages.structuredEmailId, ids),
			),
		);
	for (const row of rows) {
		const current = located.get(row.message.structuredEmailId);
		if (current && locationRank(current.folder) <= locationRank(row.folder)) {
			continue;
		}
		located.set(row.message.structuredEmailId, {
			folder: row.folder,
			uid: row.message.uid,
			flags: parseFlags(row.message.flags),
		});
	}
	return located;
}

async function syncReceivedViews(owner: MailboxOwnerRef) {
	for (const path of ["INBOX", "Junk"]) {
		const folder = await findFolder(owner, path);
		if (folder) await syncFolder(owner, folder);
	}
}

function fail(
	set: { status?: number | string },
	status: number,
	error: string,
) {
	set.status = status;
	return { error };
}

function parseJson<T>(value: string | null, fallback: T): T {
	if (!value) return fallback;
	try {
		return (JSON.parse(value) as T) ?? fallback;
	} catch {
		return fallback;
	}
}

type ParsedAddressField = {
	text?: string;
	addresses?: Array<{ name?: string | null; address?: string | null }>;
};

function formatAddress(name: string | null | undefined, address: string) {
	return name ? `${name} <${address}>` : address;
}

export function addressList(field: string | null): string[] {
	const parsed = parseJson<ParsedAddressField | null>(field, null);
	return (parsed?.addresses ?? [])
		.filter((entry) => entry.address)
		.map((entry) => formatAddress(entry.name, entry.address as string));
}

export function fromText(field: string | null): string {
	return (
		addressList(field)[0] ??
		parseJson<ParsedAddressField | null>(field, null)?.text ??
		"unknown"
	);
}

function jsonStringArray(value: string | null): string[] {
	const parsed = parseJson<unknown>(value, []);
	return Array.isArray(parsed)
		? parsed.filter((entry): entry is string => typeof entry === "string")
		: [];
}

export function preview(
	text: string | null,
	html: string | null,
): string | null {
	const source =
		text ||
		html?.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ") ||
		"";
	const compact = source.replace(/\s+/g, " ").trim();
	return compact ? compact.slice(0, 200) : null;
}

export function attachmentInfo(value: string | null) {
	const parsed = parseJson<unknown>(value, []);
	if (!Array.isArray(parsed)) return [];
	return parsed.map((entry, index) => {
		const item = (entry ?? {}) as Record<string, unknown>;
		return {
			index,
			filename: typeof item.filename === "string" ? item.filename : null,
			contentType:
				typeof item.contentType === "string"
					? item.contentType
					: typeof item.content_type === "string"
						? item.content_type
						: null,
			size: typeof item.size === "number" ? item.size : null,
		};
	});
}

export function iso(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

type ReceivedFields = Pick<
	typeof structuredEmails.$inferSelect,
	| "id"
	| "threadId"
	| "subject"
	| "fromData"
	| "toData"
	| "date"
	| "createdAt"
	| "textBody"
	| "htmlBody"
	| "attachments"
	| "isJunk"
>;

function receivedSummary(
	email: ReceivedFields,
	location: Location | undefined,
) {
	const folder: Folder = location
		? legacyFolder(location.folder, false)
		: email.isJunk
			? "junk"
			: "inbox";
	return {
		id: email.id,
		folder,
		folderPath: location?.folder.path ?? null,
		threadId: email.threadId,
		subject: email.subject,
		from: fromText(email.fromData),
		to: addressList(email.toData),
		date: iso(email.date ?? email.createdAt),
		preview: preview(email.textBody, email.htmlBody),
		isRead: location?.flags.includes("\\Seen") ?? false,
		isJunk: folder === "junk",
		hasAttachments: attachmentInfo(email.attachments).length > 0,
	};
}

function sentSummary(email: typeof sentEmails.$inferSelect) {
	return {
		id: email.id,
		folder: "sent" as Folder,
		folderPath: null,
		threadId: email.threadId,
		subject: email.subject,
		from: email.from,
		to: jsonStringArray(email.to),
		date: iso(email.sentAt ?? email.createdAt),
		preview: preview(email.textBody, email.htmlBody),
		isRead: true,
		isJunk: false,
		hasAttachments: attachmentInfo(email.attachments).length > 0,
	};
}

function receivedDetail(
	email: typeof structuredEmails.$inferSelect,
	location: Location | undefined,
) {
	return {
		...receivedSummary(email, location),
		messageId: email.messageId,
		inReplyTo: email.inReplyTo,
		cc: addressList(email.ccData),
		replyTo: addressList(email.replyToData),
		envelopeRecipients:
			email.envelopeRecipients ?? (email.recipient ? [email.recipient] : []),
		text: email.textBody,
		html: email.htmlBody,
		attachments: attachmentInfo(email.attachments),
	};
}

function sentDetail(email: typeof sentEmails.$inferSelect) {
	return {
		...sentSummary(email),
		messageId: email.messageId,
		inReplyTo: null,
		cc: jsonStringArray(email.cc),
		replyTo: jsonStringArray(email.replyTo),
		envelopeRecipients: [],
		text: email.textBody,
		html: email.htmlBody,
		attachments: attachmentInfo(email.attachments),
		status: email.status,
	};
}

async function findVisibleReceived(access: MailboxAccess, id: string) {
	const emailId = await resolveStructuredEmailId(id, access.userId);
	const [email] = await db
		.select()
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.id, emailId),
				eq(structuredEmails.userId, access.userId),
			),
		)
		.limit(1);
	return email && receivedVisibleTo(access.credential, email) ? email : null;
}

async function findVisibleSent(access: MailboxAccess, id: string) {
	const [email] = await db
		.select()
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.id, id),
				eq(sentEmails.userId, access.userId),
				sentVisibleSql(access.credential),
			),
		)
		.limit(1);
	return email ?? null;
}

async function unreadCount(access: MailboxAccess): Promise<number> {
	const owner = ownerOf(access);
	const inbox = await findFolder(owner, "INBOX");
	if (!inbox) return 0;
	await syncFolder(owner, inbox);
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(imapMailboxMessages)
		.where(
			and(
				eq(imapMailboxMessages.mailboxId, inbox.id),
				sql`NOT jsonb_exists(${imapMailboxMessages.flags}::jsonb, ${"\\Seen"})`,
			),
		);
	return Number(row?.count ?? 0);
}

export function addressesOf(
	field: AddressObject | AddressObject[] | undefined,
): string[] {
	const list = Array.isArray(field) ? field : field ? [field] : [];
	return list.flatMap((entry) =>
		entry.value
			.filter((address) => address.address)
			.map((address) =>
				formatMailbox({
					name: address.name || null,
					address: address.address as string,
				}),
			),
	);
}

function appendedSummary(
	id: string,
	parsed: ParsedMail | null,
	location: Location | undefined,
	bodies = false,
) {
	const folder: Folder = location ? legacyFolder(location.folder, true) : "sent";
	const html = typeof parsed?.html === "string" ? parsed.html : null;
	return {
		id,
		folder,
		folderPath: location?.folder.path ?? null,
		threadId: null,
		subject: parsed?.subject ?? null,
		from: addressesOf(parsed?.from)[0] ?? parsed?.from?.text ?? "unknown",
		to: addressesOf(parsed?.to),
		date: iso(parsed?.date),
		preview: bodies ? preview(parsed?.text || null, html) : null,
		isRead: location?.flags.includes("\\Seen") ?? false,
		isJunk: folder === "junk",
		hasAttachments: bodies ? (parsed?.attachments?.length ?? 0) > 0 : false,
	};
}

function appendedDetail(
	id: string,
	parsed: ParsedMail,
	location: Location | undefined,
) {
	return {
		...appendedSummary(id, parsed, location, true),
		messageId: parsed.messageId ?? null,
		inReplyTo: parsed.inReplyTo ?? null,
		cc: addressesOf(parsed.cc),
		replyTo: addressesOf(parsed.replyTo),
		envelopeRecipients: [],
		text: parsed.text ?? null,
		html: typeof parsed.html === "string" ? parsed.html : null,
		attachments: (parsed.attachments ?? []).map((attachment, index) => ({
			index,
			filename: attachment.filename || null,
			contentType: attachment.contentType || null,
			size: attachment.size ?? attachment.content?.length ?? null,
		})),
	};
}

async function parseHeaderBlock(
	raw: string | null,
): Promise<ParsedMail | null> {
	if (!raw) return null;
	const crlf = raw.indexOf("\r\n\r\n");
	const lf = raw.indexOf("\n\n");
	const end =
		crlf >= 0 && (lf < 0 || crlf < lf) ? crlf : lf >= 0 ? lf : raw.length;
	try {
		return await parseMailSafely(`${raw.slice(0, end)}\r\n\r\n`);
	} catch {
		return null;
	}
}

async function findAppended(access: MailboxAccess, id: string) {
	const owner = ownerOf(access);
	const location = (await locateMany(owner, [id], "appended")).get(id);
	if (!location) return null;
	const [appended] = await db
		.select({
			id: imapAppendedMessages.id,
			rawContent: imapAppendedMessages.rawContent,
		})
		.from(imapAppendedMessages)
		.where(
			and(
				eq(imapAppendedMessages.id, id),
				eq(imapAppendedMessages.userId, access.userId),
			),
		)
		.limit(1);
	return appended ? { ...appended, location } : null;
}

const MailboxParams = t.Object({ id: t.String() });
const MessageParams = t.Object({ id: t.String(), messageId: t.String() });

export const getMailbox = new Elysia().get(
	"/mailboxes/:id",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const { credential, via } = result.access;
		return {
			id: credential.credentialId,
			loginAddress: credential.loginAddress,
			accessMode: credential.accessMode,
			sendingMode: credential.sendingMode,
			sendingName: credential.sendingName,
			sendingAddress: credential.sendingAddress,
			allowedSendingDomains: credential.allowedDomains,
			scopes: credential.scopes.map((scope) => ({
				type: scope.type,
				domain: scope.domain,
				address: scope.address,
			})),
			protocols: credential.protocols,
			allowedIps: credential.allowedIps,
			storageQuotaBytes: credential.storageQuotaBytes,
			dailySendLimit: credential.dailySendLimit,
			selfService: credential.selfService,
			unreadCount: await unreadCount(result.access),
			authenticatedAs: via,
		};
	},
	{
		params: MailboxParams,
		response: {
			200: MailboxProfileSchema,
			400: ErrorSchema,
			401: ErrorSchema,
			403: ErrorSchema,
			404: ErrorSchema,
			409: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Get a mailbox",
			description:
				"Get a mailbox's identity, scopes and unread count. Authenticate with the account API key, or with the mailbox password and the ID `me`.",
		},
	},
);

export const listMailboxMessages = new Elysia().get(
	"/mailboxes/:id/messages",
	async ({ request, params, query, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const access = result.access;
		const owner = ownerOf(access);

		const folderName = (query.folder ?? "inbox") as ListFolder;
		const limit = Math.min(Math.max(Number(query.limit ?? 25) || 25, 1), 100);
		const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
		const search = query.search?.trim();
		const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;

		let folder: ImapMailbox | null;
		try {
			folder = await findFolder(owner, LIST_FOLDER_PATHS[folderName]);
			if (folder) folder = await syncFolder(owner, folder);
		} catch (error) {
			return handleStateError(set, error);
		}
		if (!folder) return fail(set, 404, "Folder not found");

		const conditions: SQL[] = [eq(imapMailboxMessages.mailboxId, folder.id)];
		if (query.unread === "true") {
			conditions.push(
				sql`NOT jsonb_exists(${imapMailboxMessages.flags}::jsonb, ${"\\Seen"})`,
			);
		}
		if (pattern) {
			conditions.push(
				or(
					ilike(structuredEmails.subject, pattern),
					ilike(structuredEmails.fromData, pattern),
					ilike(structuredEmails.toData, pattern),
					appendedHeadersMatch(pattern),
				) as SQL,
			);
		}
		const rows = await db
			.select({
				message: imapMailboxMessages,
				id: structuredEmails.id,
				threadId: structuredEmails.threadId,
				subject: structuredEmails.subject,
				fromData: structuredEmails.fromData,
				toData: structuredEmails.toData,
				date: structuredEmails.date,
				createdAt: structuredEmails.createdAt,
				textBody: sql<string | null>`left(${structuredEmails.textBody}, 2000)`,
				htmlBody: sql<string | null>`left(${structuredEmails.htmlBody}, 8000)`,
				attachments: structuredEmails.attachments,
				isJunk: structuredEmails.isJunk,
				appendedHead: sql<
					string | null
				>`left(${imapAppendedMessages.rawContent}, ${APPENDED_HEADER_SEARCH_CHARS}::integer)`,
			})
			.from(imapMailboxMessages)
			.leftJoin(
				structuredEmails,
				and(
					eq(imapMailboxMessages.rawSource, "structured"),
					eq(structuredEmails.id, imapMailboxMessages.structuredEmailId),
					eq(structuredEmails.userId, access.userId),
				),
			)
			.leftJoin(
				imapAppendedMessages,
				and(
					eq(imapMailboxMessages.rawSource, "appended"),
					eq(imapAppendedMessages.id, imapMailboxMessages.structuredEmailId),
					eq(imapAppendedMessages.userId, access.userId),
				),
			)
			.where(and(...conditions))
			.orderBy(desc(imapMailboxMessages.uid))
			.limit(limit + 1)
			.offset(offset);

		const current = folder;
		const messages = await Promise.all(
			rows.slice(0, limit).map(async (row) => {
				const location: Location = {
					folder: current,
					uid: row.message.uid,
					flags: parseFlags(row.message.flags),
				};
				if (row.message.rawSource === "appended" || !row.id) {
					return appendedSummary(
						row.message.structuredEmailId,
						await parseHeaderBlock(row.appendedHead),
						location,
					);
				}
				return receivedSummary(
					{
						id: row.id,
						threadId: row.threadId,
						subject: row.subject,
						fromData: row.fromData,
						toData: row.toData,
						date: row.date,
						createdAt: row.createdAt,
						textBody: row.textBody,
						htmlBody: row.htmlBody,
						attachments: row.attachments,
						isJunk: row.isJunk,
					},
					location,
				);
			}),
		);
		return {
			folder: folderName,
			messages,
			pagination: { limit, offset, hasMore: rows.length > limit },
		};
	},
	{
		params: MailboxParams,
		query: t.Object({
			folder: t.Optional(
				t.Union(
					[
						t.Literal("inbox"),
						t.Literal("archive"),
						t.Literal("junk"),
						t.Literal("sent"),
					],
					{
						description:
							"The mailbox folder, shared with IMAP: inbox (default) is INBOX, archive is Archive, junk is Junk and sent is Sent (copies of mail sent with the mailbox password, plus messages clients saved there). Use /mailboxes/{id}/folders for every folder.",
					},
				),
			),
			unread: t.Optional(t.String({ description: "'true' for unread only" })),
			search: t.Optional(
				t.String({
					description:
						"Match subject, sender or recipients (received mail) or the raw header block (sent and other stored mail; bodies are not searched)",
				}),
			),
			limit: t.Optional(t.String({ description: "1-100, default 25" })),
			offset: t.Optional(t.String({ description: "Default 0" })),
		}),
		response: {
			200: t.Object({
				folder: t.String(),
				messages: t.Array(MessageSummarySchema),
				pagination: t.Object({
					limit: t.Number(),
					offset: t.Number(),
					hasMore: t.Boolean(),
				}),
			}),
			400: ErrorSchema,
			401: ErrorSchema,
			403: ErrorSchema,
			404: ErrorSchema,
			409: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "List mailbox messages",
			description:
				"List messages in a mailbox folder, newest first. Folder membership and read state are the mailbox's own (shared with IMAP), separate from the dashboard's read state.",
		},
	},
);

export const getMailboxMessage = new Elysia().get(
	"/mailboxes/:id/messages/:messageId",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const owner = ownerOf(result.access);
		const received = await findVisibleReceived(result.access, params.messageId);
		if (received) {
			const location = (
				await locateMany(owner, [received.id], "structured")
			).get(received.id);
			return receivedDetail(received, location);
		}
		const appended = await findAppended(result.access, params.messageId);
		if (appended) {
			try {
				const parsed = await parseMailSafely(appended.rawContent);
				return appendedDetail(appended.id, parsed, appended.location);
			} catch (error) {
				if (error instanceof MailParseLimitError) {
					return fail(
						set,
						422,
						`Message could not be parsed: ${error.message}`,
					);
				}
				throw error;
			}
		}
		const sent = await findVisibleSent(result.access, params.messageId);
		if (sent) return sentDetail(sent);
		return fail(set, 404, "Message not found in this mailbox");
	},
	{
		params: MessageParams,
		response: {
			200: MessageDetailSchema,
			400: ErrorSchema,
			401: ErrorSchema,
			403: ErrorSchema,
			404: ErrorSchema,
			409: ErrorSchema,
			422: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Get a mailbox message",
			description:
				"Get a received message, or a message stored in one of the mailbox's folders (such as a sent copy), with its full text and HTML body.",
		},
	},
);

export const updateMailboxMessage = new Elysia().patch(
	"/mailboxes/:id/messages/:messageId",
	async ({ request, params, body, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		if (!canWrite(result.access.credential)) {
			return fail(set, 403, "This mailbox is read-only");
		}
		if (
			body.isRead === undefined &&
			body.isArchived === undefined &&
			body.isJunk === undefined
		) {
			return fail(set, 400, "Provide isRead, isArchived and/or isJunk");
		}
		if (body.isArchived === true && body.isJunk === true) {
			return fail(set, 400, "A message can't be archived and junk at once");
		}
		const email = await findVisibleReceived(result.access, params.messageId);
		if (!email)
			return fail(set, 404, "Received message not found in this mailbox");
		const owner = ownerOf(result.access);

		try {
			await syncReceivedViews(owner);
			const locate = async () =>
				(await locateMany(owner, [email.id], "structured")).get(email.id);
			let location = await locate();
			if (!location) {
				return fail(
					set,
					409,
					"This message is not in any folder of the mailbox yet",
				);
			}
			const moveTo = async (path: string) => {
				const current = location as Location;
				if (current.folder.path === path && !current.folder.scopeId) return;
				const destination = await findFolder(owner, path);
				if (!destination) throw new Error(`${path} folder not found`);
				await transferMessages(
					owner,
					current.folder.id,
					destination.id,
					[current.uid],
					!current.folder.scopeId,
				);
				location = await locate();
				if (!location) throw new Error("Message disappeared during move");
			};
			if (body.isJunk === true) await moveTo("Junk");
			if (body.isJunk === false && location.folder.path === "Junk") {
				await moveTo(body.isArchived === true ? "Archive" : "INBOX");
			}
			if (body.isArchived === true) await moveTo("Archive");
			if (body.isArchived === false && location.folder.path === "Archive") {
				await moveTo("INBOX");
			}
			if (body.isRead !== undefined) {
				const current = location as Location;
				const updated = await updateFlags(
					owner,
					current.folder.id,
					[current.uid],
					body.isRead ? "add" : "remove",
					["\\Seen"],
				);
				if (updated[0]) location = { ...current, flags: updated[0].flags };
			}
			return receivedSummary(email, location);
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: MessageParams,
		body: t.Object({
			isRead: t.Optional(
				t.Boolean({
					description:
						"Sets or clears \\Seen in the mailbox (shared with IMAP). The dashboard's read state is separate.",
				}),
			),
			isArchived: t.Optional(
				t.Boolean({
					description:
						"Move to the Archive folder (true) or from Archive back to INBOX (false)",
				}),
			),
			isJunk: t.Optional(
				t.Boolean({
					description:
						"Move to Junk (true) or back to the inbox (false). Sets this mailbox's own junk verdict, shared with IMAP; other mailboxes and the account-level spam verdict are unchanged.",
				}),
			),
		}),
		response: {
			200: MessageSummarySchema,
			400: ErrorSchema,
			401: ErrorSchema,
			403: ErrorSchema,
			404: ErrorSchema,
			409: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Mark a mailbox message read, archived or junk",
			description:
				"Requires a read_write mailbox. Updates the mailbox's own state, shared with IMAP: isRead sets \\Seen, isArchived moves between INBOX and Archive, and isJunk moves between INBOX and Junk for this mailbox only. The dashboard's state and the account-level spam verdict are separate.",
		},
	},
);

export const getMailboxThread = new Elysia().get(
	"/mailboxes/:id/threads/:threadId",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const { access } = result;
		const [received, sent] = await Promise.all([
			db
				.select()
				.from(structuredEmails)
				.where(
					and(
						eq(structuredEmails.userId, access.userId),
						eq(structuredEmails.threadId, params.threadId),
						receivedVisibleSql(access.credential),
					),
				)
				.limit(200),
			db
				.select()
				.from(sentEmails)
				.where(
					and(
						eq(sentEmails.userId, access.userId),
						eq(sentEmails.threadId, params.threadId),
						sentVisibleSql(access.credential),
					),
				)
				.limit(200),
		]);
		const locations = await locateMany(
			ownerOf(access),
			received.map((email) => email.id),
			"structured",
		);
		const messages = [
			...received.map((email) =>
				receivedDetail(email, locations.get(email.id)),
			),
			...sent.map(sentDetail),
		].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
		if (messages.length === 0) {
			return fail(set, 404, "Thread not found in this mailbox");
		}
		return { threadId: params.threadId, messages };
	},
	{
		params: t.Object({ id: t.String(), threadId: t.String() }),
		response: {
			200: t.Object({
				threadId: t.String(),
				messages: t.Array(MessageDetailSchema),
			}),
			400: ErrorSchema,
			401: ErrorSchema,
			403: ErrorSchema,
			404: ErrorSchema,
			409: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Get a mailbox thread",
			description:
				"Get every message of a conversation that is visible to the mailbox, oldest first.",
		},
	},
);

export const getMailboxAttachment = new Elysia().get(
	"/mailboxes/:id/messages/:messageId/attachments/:index",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const index = Number(params.index);
		if (!/^\d+$/.test(params.index) || !Number.isSafeInteger(index)) {
			return fail(set, 400, "Attachment index must be a non-negative integer");
		}
		const email = await findVisibleReceived(result.access, params.messageId);
		if (!email)
			return fail(set, 404, "Received message not found in this mailbox");
		const loaded = await loadStoredAttachments(email.id, result.access.userId);
		if (!loaded.ok) return fail(set, loaded.status, loaded.error);
		const attachment = loaded.attachments[index];
		if (!attachment) return fail(set, 404, "Attachment not found");
		return attachmentResponse(attachment, `attachment-${index + 1}`);
	},
	{
		params: t.Object({
			id: t.String(),
			messageId: t.String(),
			index: t.String(),
		}),
		response: {
			400: ErrorSchema,
			401: ErrorSchema,
			403: ErrorSchema,
			404: ErrorSchema,
			409: ErrorSchema,
			422: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Download a mailbox attachment",
			description:
				"Download an attachment of a received message by its position (0-based).",
		},
	},
);
