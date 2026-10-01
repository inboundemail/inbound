import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { attachmentResponse } from "@/app/api/e2/attachments/get";
import {
	authorizeMailboxAccess,
	canWrite,
	type MailboxAccess,
	receivedVisibleSql,
	receivedVisibleTo,
	sentVisibleSql,
} from "@/app/api/e2/mailboxes/access";
import { db } from "@/lib/db";
import { sentEmails, structuredEmails } from "@/lib/db/schema";
import { resolveStructuredEmailId } from "@/lib/email-management/email-aliases";
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
	unreadCount: t.Number(),
	authenticatedAs: t.Union([t.Literal("account"), t.Literal("mailbox")]),
});

const MessageSummarySchema = t.Object({
	id: t.String(),
	folder: t.Union([
		t.Literal("inbox"),
		t.Literal("archive"),
		t.Literal("sent"),
	]),
	threadId: t.Nullable(t.String()),
	subject: t.Nullable(t.String()),
	from: t.String(),
	to: t.Array(t.String()),
	date: t.Nullable(t.String()),
	preview: t.Nullable(t.String()),
	isRead: t.Boolean(),
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

type Folder = "inbox" | "archive" | "sent";

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

function addressList(field: string | null): string[] {
	const parsed = parseJson<ParsedAddressField | null>(field, null);
	return (parsed?.addresses ?? [])
		.filter((entry) => entry.address)
		.map((entry) => formatAddress(entry.name, entry.address as string));
}

function fromText(field: string | null): string {
	return addressList(field)[0] ?? parseJson<ParsedAddressField | null>(field, null)?.text ?? "unknown";
}

function jsonStringArray(value: string | null): string[] {
	const parsed = parseJson<unknown>(value, []);
	return Array.isArray(parsed)
		? parsed.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function preview(text: string | null, html: string | null): string | null {
	const source =
		text ||
		html
			?.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<[^>]+>/g, " ") ||
		"";
	const compact = source.replace(/\s+/g, " ").trim();
	return compact ? compact.slice(0, 200) : null;
}

function attachmentInfo(value: string | null) {
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

function iso(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

function receivedSummary(email: typeof structuredEmails.$inferSelect) {
	return {
		id: email.id,
		folder: (email.isArchived ? "archive" : "inbox") as Folder,
		threadId: email.threadId,
		subject: email.subject,
		from: fromText(email.fromData),
		to: addressList(email.toData),
		date: iso(email.date ?? email.createdAt),
		preview: preview(email.textBody, email.htmlBody),
		isRead: email.isRead ?? false,
		hasAttachments: attachmentInfo(email.attachments).length > 0,
	};
}

function sentSummary(email: typeof sentEmails.$inferSelect) {
	return {
		id: email.id,
		folder: "sent" as Folder,
		threadId: email.threadId,
		subject: email.subject,
		from: email.from,
		to: jsonStringArray(email.to),
		date: iso(email.sentAt ?? email.createdAt),
		preview: preview(email.textBody, email.htmlBody),
		isRead: true,
		hasAttachments: attachmentInfo(email.attachments).length > 0,
	};
}

function receivedDetail(email: typeof structuredEmails.$inferSelect) {
	return {
		...receivedSummary(email),
		messageId: email.messageId,
		inReplyTo: email.inReplyTo,
		cc: addressList(email.ccData),
		replyTo: addressList(email.replyToData),
		envelopeRecipients: email.envelopeRecipients ?? (email.recipient ? [email.recipient] : []),
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
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.userId, access.userId),
				receivedVisibleSql(access.credential),
				sql`structured_emails.is_read IS NOT TRUE`,
				sql`structured_emails.is_archived IS NOT TRUE`,
			),
		);
	return row?.count ?? 0;
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

		const folder = (query.folder ?? "inbox") as Folder;
		const limit = Math.min(Math.max(Number(query.limit ?? 25) || 25, 1), 100);
		const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
		const search = query.search?.trim();
		const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;

		if (folder === "sent") {
			const conditions: SQL[] = [
				eq(sentEmails.userId, access.userId),
				sentVisibleSql(access.credential),
			];
			if (pattern) {
				conditions.push(
					or(
						ilike(sentEmails.subject, pattern),
						ilike(sentEmails.to, pattern),
					) as SQL,
				);
			}
			const rows = await db
				.select()
				.from(sentEmails)
				.where(and(...conditions))
				.orderBy(desc(sentEmails.createdAt))
				.limit(limit + 1)
				.offset(offset);
			return {
				folder,
				messages: rows.slice(0, limit).map(sentSummary),
				pagination: { limit, offset, hasMore: rows.length > limit },
			};
		}

		const conditions: SQL[] = [
			eq(structuredEmails.userId, access.userId),
			receivedVisibleSql(access.credential),
			folder === "archive"
				? sql`structured_emails.is_archived IS TRUE`
				: sql`structured_emails.is_archived IS NOT TRUE`,
		];
		if (query.unread === "true") {
			conditions.push(sql`structured_emails.is_read IS NOT TRUE`);
		}
		if (pattern) {
			conditions.push(
				or(
					ilike(structuredEmails.subject, pattern),
					ilike(structuredEmails.fromData, pattern),
				) as SQL,
			);
		}
		const rows = await db
			.select()
			.from(structuredEmails)
			.where(and(...conditions))
			.orderBy(desc(structuredEmails.createdAt))
			.limit(limit + 1)
			.offset(offset);
		return {
			folder,
			messages: rows.slice(0, limit).map(receivedSummary),
			pagination: { limit, offset, hasMore: rows.length > limit },
		};
	},
	{
		params: MailboxParams,
		query: t.Object({
			folder: t.Optional(
				t.Union([t.Literal("inbox"), t.Literal("archive"), t.Literal("sent")], {
					description: "inbox (default): received and not archived; archive; sent",
				}),
			),
			unread: t.Optional(t.String({ description: "'true' for unread only" })),
			search: t.Optional(
				t.String({ description: "Match subject or sender (received) / recipients (sent)" }),
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
				"List messages in a mailbox folder, newest first. Only mail within the mailbox's scopes is visible.",
		},
	},
);

export const getMailboxMessage = new Elysia().get(
	"/mailboxes/:id/messages/:messageId",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const received = await findVisibleReceived(result.access, params.messageId);
		if (received) return receivedDetail(received);
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
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Get a mailbox message",
			description: "Get a received or sent message with its full text and HTML body.",
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
		if (body.isRead === undefined && body.isArchived === undefined) {
			return fail(set, 400, "Provide isRead and/or isArchived");
		}
		const email = await findVisibleReceived(result.access, params.messageId);
		if (!email) return fail(set, 404, "Received message not found in this mailbox");

		const now = new Date();
		const changes: Partial<typeof structuredEmails.$inferInsert> = {
			updatedAt: now,
		};
		if (body.isRead !== undefined) {
			changes.isRead = body.isRead;
			changes.readAt = body.isRead ? now : null;
		}
		if (body.isArchived !== undefined) {
			changes.isArchived = body.isArchived;
			changes.archivedAt = body.isArchived ? now : null;
		}
		const [updated] = await db
			.update(structuredEmails)
			.set(changes)
			.where(
				and(
					eq(structuredEmails.id, email.id),
					eq(structuredEmails.userId, result.access.userId),
				),
			)
			.returning();
		return receivedSummary(updated ?? { ...email, ...changes });
	},
	{
		params: MessageParams,
		body: t.Object({
			isRead: t.Optional(t.Boolean()),
			isArchived: t.Optional(t.Boolean()),
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
			summary: "Mark a mailbox message read or archived",
			description: "Requires a read_write mailbox. Changes are shared with the dashboard.",
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
		const messages = [
			...received.map(receivedDetail),
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
			description: "Get every message of a conversation that is visible to the mailbox, oldest first.",
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
		if (!email) return fail(set, 404, "Received message not found in this mailbox");
		const loaded = await loadStoredAttachments(email.id, result.access.userId);
		if (!loaded.ok) return fail(set, loaded.status, loaded.error);
		const attachment = loaded.attachments[index];
		if (!attachment) return fail(set, 404, "Attachment not found");
		return attachmentResponse(attachment, `attachment-${index + 1}`);
	},
	{
		params: t.Object({ id: t.String(), messageId: t.String(), index: t.String() }),
		response: {
			400: ErrorSchema,
			401: ErrorSchema,
			403: ErrorSchema,
			404: ErrorSchema,
			409: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Download a mailbox attachment",
			description: "Download an attachment of a received message by its position (0-based).",
		},
	},
);
