import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { t } from "elysia";
import { db } from "@/lib/db";
import type { ImapMailbox } from "@/lib/db/schema";
import {
	imapAppendedMessages,
	imapMailboxes,
	imapMailboxMessages,
} from "@/lib/db/schema";
import {
	DEFAULT_FOLDERS,
	isScopeMailboxPath,
	normalizeMailboxPath,
	SPECIAL_USE,
} from "@/packages/imap-gateway/src/mailbox-rules";

export type MailboxOwnerRef = { userId: string; credentialId: string };

function envLimit(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export const APPEND_MAX_MESSAGE_BYTES = envLimit(
	"IMAP_MAX_MESSAGE_BYTES",
	1024 * 1024,
);
export const APPEND_MAX_BYTES_PER_USER = envLimit(
	"IMAP_APPEND_MAX_BYTES_PER_USER",
	250 * 1024 * 1024,
);
export const APPEND_MAX_MESSAGES_PER_USER = envLimit(
	"IMAP_APPEND_MAX_MESSAGES_PER_USER",
	5_000,
);

export const APPENDED_HEADER_SEARCH_CHARS = 32 * 1024;

export const ErrorSchema = t.Object({ error: t.String() });

export const FolderSchema = t.Object({
	path: t.String(),
	name: t.String(),
	specialUse: t.Nullable(t.String()),
	scopeId: t.Nullable(t.String()),
	subscribed: t.Boolean(),
	uidValidity: t.Number(),
	uidNext: t.Number(),
	highestModseq: t.Number(),
	total: t.Number(),
	unread: t.Number(),
});

export type MailboxStateFailure = { status: number; error: string };

function databaseError(
	error: unknown,
	depth = 0,
): { code: string; message: string } | null {
	if (typeof error !== "object" || error === null || depth > 5) return null;
	const record = error as Record<string, unknown>;
	if (typeof record.code === "string" && /^[0-9A-Z]{5}$/.test(record.code)) {
		return {
			code: record.code,
			message: typeof record.message === "string" ? record.message : "",
		};
	}
	return databaseError(record.cause, depth + 1);
}

export function mailboxStateFailure(
	error: unknown,
): MailboxStateFailure | null {
	const found = databaseError(error);
	if (!found) return null;
	const { code } = found;
	const message = found.message || "Mailbox operation failed";
	if (code === "42501" && /read-only|credential not found/i.test(message)) {
		return {
			status: 403,
			error: /read-only/i.test(message)
				? "This mailbox or folder is read-only"
				: "Mailbox access denied",
		};
	}
	if (code === "23505" && /imap_mailboxes/.test(message)) {
		return { status: 409, error: "A folder with that path already exists" };
	}
	if (code !== "P0001") return null;
	if (/quota/i.test(message)) {
		return { status: 413, error: "Mailbox storage quota exceeded" };
	}
	if (/not found/i.test(message)) return { status: 404, error: message };
	return { status: 400, error: message };
}

function intArray(values: number[]) {
	if (values.length === 0) return sql`ARRAY[]::integer[]`;
	return sql`ARRAY[${sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	)}]::integer[]`;
}

function textArray(values: string[]) {
	if (values.length === 0) return sql`ARRAY[]::text[]`;
	return sql`ARRAY[${sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	)}]::text[]`;
}

export function parseFlags(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? parsed.filter((flag): flag is string => typeof flag === "string")
			: [];
	} catch {
		return [];
	}
}

export function folderPathFromParam(value: string): string | null {
	try {
		return normalizeMailboxPath(value);
	} catch {
		return null;
	}
}

async function loadFolders(owner: MailboxOwnerRef): Promise<ImapMailbox[]> {
	return db
		.select()
		.from(imapMailboxes)
		.where(
			and(
				eq(imapMailboxes.userId, owner.userId),
				eq(imapMailboxes.credentialId, owner.credentialId),
			),
		)
		.orderBy(asc(imapMailboxes.path));
}

export async function ensureFolders(
	owner: MailboxOwnerRef,
): Promise<ImapMailbox[]> {
	await db.execute(
		sql`SELECT id FROM imap_ensure(${owner.userId}::text, ${owner.credentialId}::text)`,
	);
	return loadFolders(owner);
}

async function loadFolder(
	owner: MailboxOwnerRef,
	path: string,
): Promise<ImapMailbox | null> {
	const [folder] = await db
		.select()
		.from(imapMailboxes)
		.where(
			and(
				eq(imapMailboxes.userId, owner.userId),
				eq(imapMailboxes.credentialId, owner.credentialId),
				eq(imapMailboxes.path, path),
			),
		)
		.limit(1);
	return folder ?? null;
}

export async function findFolder(
	owner: MailboxOwnerRef,
	path: string,
): Promise<ImapMailbox | null> {
	const folder = await loadFolder(owner, path);
	if (folder) return folder;
	if (
		!DEFAULT_FOLDERS.some((name) => name === path) &&
		!isScopeMailboxPath(path)
	) {
		return null;
	}
	const folders = await ensureFolders(owner);
	return folders.find((item) => item.path === path) ?? null;
}

export async function syncFolder(
	owner: MailboxOwnerRef,
	folder: ImapMailbox,
): Promise<ImapMailbox> {
	await db.execute(
		sql`SELECT id FROM imap_sync(${owner.userId}::text, ${owner.credentialId}::text, ${folder.id}::text)`,
	);
	return (await loadFolder(owner, folder.path)) ?? folder;
}

export async function syncReceivedFolders(
	owner: MailboxOwnerRef,
	folders: ImapMailbox[],
): Promise<ImapMailbox[]> {
	const targets = folders.filter(
		(folder) =>
			folder.path === "INBOX" || folder.path === "Junk" || folder.scopeId,
	);
	if (targets.length === 0) return folders;
	for (const folder of targets) {
		await db.execute(
			sql`SELECT id FROM imap_sync(${owner.userId}::text, ${owner.credentialId}::text, ${folder.id}::text)`,
		);
	}
	return loadFolders(owner);
}

export function appendedHeadersMatch(pattern: string): SQL {
	const head = sql`left(${imapAppendedMessages.rawContent}, ${APPENDED_HEADER_SEARCH_CHARS}::integer)`;
	return sql`coalesce(substring(${head} from ${"^(.*?)\\r?\\n\\r?\\n"}::text), ${head}) ILIKE ${pattern}`;
}

export async function folderCounts(folderIds: string[]) {
	const counts = new Map<string, { total: number; unread: number }>();
	if (folderIds.length === 0) return counts;
	const rows = await db
		.select({
			mailboxId: imapMailboxMessages.mailboxId,
			total: sql<number>`count(*)::int`,
			unread: sql<number>`(count(*) FILTER (WHERE NOT jsonb_exists(${imapMailboxMessages.flags}::jsonb, ${"\\Seen"}::text)))::int`,
		})
		.from(imapMailboxMessages)
		.where(inArray(imapMailboxMessages.mailboxId, folderIds))
		.groupBy(imapMailboxMessages.mailboxId);
	for (const row of rows) {
		counts.set(row.mailboxId, {
			total: Number(row.total),
			unread: Number(row.unread),
		});
	}
	return counts;
}

export function serializeFolder(
	folder: ImapMailbox,
	counts: { total: number; unread: number } | undefined,
) {
	const segments = folder.path.split("/");
	return {
		path: folder.path,
		name: segments[segments.length - 1] ?? folder.path,
		specialUse: folder.scopeId ? null : (SPECIAL_USE[folder.path] ?? null),
		scopeId: folder.scopeId,
		subscribed: folder.subscribed,
		uidValidity: folder.uidValidity,
		uidNext: folder.uidNext,
		highestModseq: folder.modseq,
		total: counts?.total ?? 0,
		unread: counts?.unread ?? 0,
	};
}

export async function folderOperation(
	owner: MailboxOwnerRef,
	operation: "create" | "rename" | "delete" | "subscribe",
	path: string,
	options: { newPath?: string | null; subscribed?: boolean | null } = {},
): Promise<string[]> {
	const result = await db.execute(sql`
		SELECT path FROM imap_folder(${owner.userId}::text, ${owner.credentialId}::text,
			${operation}::text, ${path}::text, ${options.newPath ?? null}::text,
			${options.subscribed ?? null}::boolean)`);
	return result.rows.map((row) => String(row.path));
}

export async function updateFlags(
	owner: MailboxOwnerRef,
	folderId: string,
	uids: number[],
	action: "set" | "add" | "remove",
	flags: string[],
): Promise<Array<{ uid: number; flags: string[] }>> {
	const result = await db.execute(sql`
		SELECT uid, flags FROM imap_flags(${owner.userId}::text, ${owner.credentialId}::text,
			${folderId}::text, ${intArray(uids)}, ${action}::text, ${textArray(flags)})`);
	return result.rows.map((row) => ({
		uid: Number(row.uid),
		flags: parseFlags(String(row.flags)),
	}));
}

export async function transferMessages(
	owner: MailboxOwnerRef,
	sourceId: string,
	destinationId: string,
	uids: number[],
	move: boolean,
): Promise<Array<{ sourceUid: number; destinationUid: number }>> {
	const result = await db.execute(sql`
		SELECT source_uid, destination_uid FROM imap_transfer(${owner.userId}::text,
			${owner.credentialId}::text, ${sourceId}::text, ${destinationId}::text, ${intArray(uids)},
			${move}::boolean)`);
	return result.rows.map((row) => ({
		sourceUid: Number(row.source_uid),
		destinationUid: Number(row.destination_uid),
	}));
}

export async function expungeMessages(
	owner: MailboxOwnerRef,
	folderId: string,
	uids: number[] | null,
	force = false,
): Promise<number[]> {
	const result = await db.execute(sql`
		SELECT uid FROM imap_expunge(${owner.userId}::text, ${owner.credentialId}::text,
			${folderId}::text, ${uids ? intArray(uids) : sql`NULL::integer[]`}, ${force}::boolean)`);
	return result.rows.map((row) => Number(row.uid));
}

export async function appendMessage(
	owner: MailboxOwnerRef,
	folderId: string,
	raw: string,
	flags: string[],
	date: Date,
): Promise<{ uid: number; uidValidity: number }> {
	const result = await db.execute(sql`
		SELECT uid, uid_validity FROM imap_append(${owner.userId}::text,
			${owner.credentialId}::text, ${folderId}::text, ${raw}::text, ${textArray(flags)},
			${date.toISOString()}::timestamp, ${APPEND_MAX_BYTES_PER_USER}::bigint,
			${APPEND_MAX_MESSAGES_PER_USER}::integer)`);
	const row = result.rows[0];
	if (!row) throw new Error("Append returned no row");
	return { uid: Number(row.uid), uidValidity: Number(row.uid_validity) };
}
