import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { AuthenticatedMailbox, MailboxScope } from "./auth.ts";
import { buildSearchWhere, type SearchNode } from "./search.ts";

export interface MailboxRow {
	id: string;
	address: string;
	path: string;
	uidValidity: number;
	uidNext: number;
	modseq: number;
	credentialId: string | null;
	scopeId: string | null;
}

export interface JournalEntry {
	command: "EXISTS" | "EXPUNGE";
	uid: number;
	modseq: number;
	_id: string;
}

export interface MessageMeta {
	uid: number;
	structuredEmailId: string;
	rawSource: string;
	flags: string[];
	internalDate: Date;
	size: number | null;
}

export const DEFAULT_FOLDERS = [
	"INBOX",
	"Sent",
	"Drafts",
	"Trash",
	"Junk",
] as const;

export const SPECIAL_USE: Record<string, string> = {
	Sent: "\\Sent",
	Drafts: "\\Drafts",
	Trash: "\\Trash",
	Junk: "\\Junk",
};

export function scopeMailboxPath(scope: MailboxScope): string {
	return `Scopes/${scope.type === "domain" ? `*@${scope.domain}` : scope.address}`;
}

export type FlagAction = "set" | "add" | "remove";

interface MailStoreOptions {
	appendMaxBytesPerUser: number;
	appendMaxMessagesPerUser: number;
}

export class AppendQuotaError extends Error {}

export type MailboxOwner = Pick<AuthenticatedMailbox, "userId" | "credentialId">;

export const MESSAGE_BATCH_SIZE = 500;

function ownedMailbox(
	sql: postgres.Sql | postgres.TransactionSql,
	mailboxId: string,
	owner: MailboxOwner,
) {
	return sql`EXISTS (
		SELECT 1 FROM imap_mailboxes owner
		WHERE owner.id = ${mailboxId}
		  AND owner.user_id = ${owner.userId}
		  AND owner.credential_id = ${owner.credentialId})`;
}

type MessageRow = {
	uid: number;
	structured_email_id: string;
	raw_source: string;
	flags: string;
	internal_date: Date;
	size: number | null;
};

function toMessageMeta(row: MessageRow): MessageMeta {
	return {
		uid: row.uid,
		structuredEmailId: row.structured_email_id,
		rawSource: row.raw_source,
		flags: parseFlags(row.flags),
		internalDate: row.internal_date,
		size: row.size,
	};
}

function visibleToScopes(
	sql: postgres.Sql | postgres.TransactionSql,
	scopes: MailboxScope[],
) {
	const addresses = scopes
		.filter((scope) => scope.type === "address" && scope.address)
		.map((scope) => scope.address?.toLowerCase() ?? "");
	const domains = scopes
		.filter((scope) => scope.type === "domain")
		.map((scope) => scope.domain.toLowerCase());
	return sql`(se.guard_blocked IS NOT TRUE AND coalesce(
		lower(se.recipient) = ANY(${addresses})
		OR (
			split_part(lower(se.recipient), '@', 2) = ANY(${domains})
			AND split_part(lower(se.recipient), '@', 1) <> 'dmarc'
		)
		OR coalesce(se.envelope_recipients, '{}') && ${addresses}::text[]
		OR EXISTS (
			SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address)
			WHERE split_part(envelope.address, '@', 2) = ANY(${domains})
			  AND split_part(envelope.address, '@', 1) <> 'dmarc'
		), FALSE))`;
}

/**
 * INBOX (with the scope folders) and Junk are the two views of received mail:
 * a received message is in Junk when structured_emails.is_junk is true, and in
 * INBOX otherwise. Copying a received message into one of them sets the
 * verdict. Returns the verdict a folder implies, or null for other folders.
 */
export function receivedViewJunkVerdict(
	mailbox: Pick<MailboxRow, "path" | "scopeId" | "credentialId">,
): boolean | null {
	if (!mailbox.credentialId || mailbox.scopeId) return null;
	if (mailbox.path === "INBOX") return false;
	if (mailbox.path === "Junk") return true;
	return null;
}

interface RemovedRow {
	structured_email_id: string;
	raw_source: string;
}

interface DeletedRow {
	mailbox_id: string;
	uid: number;
}

export interface PendingExpunge {
	mailboxId: string;
	uid: number;
	modseq: number;
}

const JOURNAL_MAX_PER_MAILBOX = 2000;
const JOURNAL_MAX_MAILBOXES = 10_000;
const JOURNAL_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Recent server-side removals per mailbox, so selected sessions receive
 * EXPUNGE for messages that another session or a sync removed. In memory on
 * the single gateway host; a session older than the retained entries sees the
 * change when it selects the folder again.
 */
export class ExpungeJournal {
	private entries = new Map<
		string,
		Array<{ uid: number; modseq: number; at: number }>
	>();

	constructor(private now: () => number = Date.now) {}

	record(pending: PendingExpunge[]): void {
		const at = this.now();
		for (const entry of pending) {
			const list = this.entries.get(entry.mailboxId) ?? [];
			this.entries.delete(entry.mailboxId);
			list.push({ uid: entry.uid, modseq: entry.modseq, at });
			this.entries.set(entry.mailboxId, this.prune(list, at));
		}
		while (this.entries.size > JOURNAL_MAX_MAILBOXES) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
	}

	since(mailboxId: string, modseq: number): Array<{ uid: number; modseq: number }> {
		const list = this.entries.get(mailboxId);
		if (!list) return [];
		const kept = this.prune(list, this.now());
		if (kept.length === 0) {
			this.entries.delete(mailboxId);
			return [];
		}
		this.entries.set(mailboxId, kept);
		return kept
			.filter((entry) => entry.modseq > modseq)
			.map(({ uid, modseq: entryModseq }) => ({ uid, modseq: entryModseq }));
	}

	private prune(
		list: Array<{ uid: number; modseq: number; at: number }>,
		now: number,
	) {
		const fresh = list.filter((entry) => now - entry.at <= JOURNAL_MAX_AGE_MS);
		return fresh.slice(-JOURNAL_MAX_PER_MAILBOX);
	}
}

/** Bumps each mailbox's modseq once per removed message and queues EXPUNGE entries. */
async function journalDeletes(
	sql: postgres.TransactionSql,
	rows: DeletedRow[],
	pending: PendingExpunge[],
): Promise<void> {
	const byMailbox = new Map<string, number[]>();
	for (const row of rows) {
		const uids = byMailbox.get(row.mailbox_id) ?? [];
		uids.push(row.uid);
		byMailbox.set(row.mailbox_id, uids);
	}
	for (const mailboxId of [...byMailbox.keys()].sort()) {
		const uids = (byMailbox.get(mailboxId) ?? []).sort((x, y) => x - y);
		const bumped = await sql<{ modseq: number }[]>`
			UPDATE imap_mailboxes
			SET modseq = modseq + ${uids.length}, updated_at = now()
			WHERE id = ${mailboxId}
			RETURNING modseq`;
		const top = bumped[0]?.modseq;
		if (top === undefined) continue;
		uids.forEach((uid, index) => {
			pending.push({ mailboxId, uid, modseq: top - uids.length + 1 + index });
		});
	}
}

/** Locks the credential's received views and the given mailboxes, in id order. */
async function lockMailboxes(
	sql: postgres.TransactionSql,
	owner: MailboxOwner,
	mailboxIds: string[],
): Promise<void> {
	await sql`
		SELECT id FROM imap_mailboxes
		WHERE user_id = ${owner.userId}
		  AND credential_id = ${owner.credentialId}
		  AND (id = ANY(${mailboxIds})
		       OR path = 'INBOX' OR path = 'Junk' OR scope_id IS NOT NULL)
		ORDER BY id
		FOR UPDATE`;
}

async function removeFromMirroredMailboxes(
	sql: postgres.TransactionSql,
	mailboxId: string,
	removed: RemovedRow[],
): Promise<DeletedRow[]> {
	const ids = removed
		.filter((row) => row.raw_source === "structured")
		.map((row) => row.structured_email_id);
	if (ids.length === 0) return [];
	const rows = await sql<
		{ credential_id: string | null; mirrored: boolean; junk: boolean }[]
	>`
		SELECT credential_id,
		       (path = 'INBOX' OR scope_id IS NOT NULL) AS mirrored,
		       (path = 'Junk' AND scope_id IS NULL) AS junk
		FROM imap_mailboxes WHERE id = ${mailboxId}`;
	const credentialId = rows[0]?.credential_id;
	if (!credentialId) return [];
	if (rows[0]?.junk) {
		await sql`
			INSERT INTO imap_mailbox_removals (credential_id, structured_email_id)
			SELECT ${credentialId}, removed.id FROM unnest(${ids}::text[]) AS removed(id)
			WHERE NOT EXISTS (
				SELECT 1 FROM imap_mailbox_messages mm
				JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
				WHERE mb.credential_id = ${credentialId}
				  AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
				  AND mm.raw_source = 'structured'
				  AND mm.structured_email_id = removed.id)
			ON CONFLICT DO NOTHING`;
		return [];
	}
	if (!rows[0]?.mirrored) return [];
	await sql`
		INSERT INTO imap_mailbox_removals (credential_id, structured_email_id)
		SELECT ${credentialId}, removed.id FROM unnest(${ids}::text[]) AS removed(id)
		WHERE NOT EXISTS (
			SELECT 1 FROM imap_mailbox_messages mm
			JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
			WHERE mb.credential_id = ${credentialId}
			  AND mb.path = 'Junk' AND mb.scope_id IS NULL
			  AND mm.raw_source = 'structured'
			  AND mm.structured_email_id = removed.id)
		ON CONFLICT DO NOTHING`;
	return sql<DeletedRow[]>`
		DELETE FROM imap_mailbox_messages mm
		USING imap_mailboxes mb
		WHERE mm.mailbox_id = mb.id
		  AND mb.credential_id = ${credentialId}
		  AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
		  AND mm.raw_source = 'structured'
		  AND mm.structured_email_id = ANY(${ids})
		RETURNING mm.mailbox_id, mm.uid`;
}

async function deleteOrphanedAppended(
	sql: postgres.TransactionSql,
	deleted: RemovedRow[],
): Promise<void> {
	const appendedIds = deleted
		.filter((row) => row.raw_source === "appended")
		.map((row) => row.structured_email_id);
	if (appendedIds.length === 0) return;
	await sql`
		DELETE FROM imap_appended_messages am
		WHERE am.id = ANY(${appendedIds})
		  AND NOT EXISTS (
			SELECT 1 FROM imap_mailbox_messages mm
			WHERE mm.raw_source = 'appended'
			  AND mm.structured_email_id = am.id)`;
}

/**
 * Moves received messages whose verdict changed from one view to the other
 * (INBOX -> Junk when junk, Junk -> INBOX otherwise), keeping their flags.
 */
async function transferBetweenViews(
	sql: postgres.TransactionSql,
	fromId: string,
	toId: string,
	toJunk: boolean,
	pending: PendingExpunge[],
): Promise<void> {
	const moved = await sql<
		{
			mailbox_id: string;
			uid: number;
			structured_email_id: string;
			flags: string;
			internal_date: Date;
			size: number | null;
		}[]
	>`
		DELETE FROM imap_mailbox_messages mm
		USING structured_emails se
		WHERE mm.mailbox_id = ${fromId}
		  AND mm.raw_source = 'structured'
		  AND se.id = mm.structured_email_id
		  AND ${toJunk ? sql`se.is_junk IS TRUE` : sql`se.is_junk IS NOT TRUE`}
		RETURNING mm.mailbox_id, mm.uid, mm.structured_email_id, mm.flags,
		          mm.internal_date, mm.size`;
	if (moved.length === 0) return;
	await journalDeletes(sql, moved, pending);
	const target = await sql<{ uid_next: number; modseq: number }[]>`
		SELECT uid_next, modseq FROM imap_mailboxes WHERE id = ${toId}`;
	if (!target[0]) return;
	let uid = target[0].uid_next;
	let modseq = target[0].modseq;
	for (const row of [...moved].sort((x, y) => x.uid - y.uid)) {
		const inserted = await sql<{ uid: number }[]>`
			INSERT INTO imap_mailbox_messages
				(id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
			VALUES (${`${toId}:${uid}`}, ${toId}, ${row.structured_email_id},
				'structured', ${uid}, ${row.flags}, ${row.internal_date}, ${row.size},
				${modseq + 1})
			ON CONFLICT (mailbox_id, structured_email_id) DO NOTHING
			RETURNING uid`;
		if (inserted.length === 0) continue;
		uid++;
		modseq++;
	}
	await sql`
		UPDATE imap_mailboxes
		SET uid_next = ${uid}, modseq = ${modseq}, updated_at = now()
		WHERE id = ${toId}`;
}

type CopyResult = {
	uidValidity: number;
	sourceUid: number[];
	destinationUid: number[];
};

async function copyWithin(
	sql: postgres.TransactionSql,
	owner: MailboxOwner,
	sourceMailboxId: string,
	destination: MailboxRow,
	uids: number[],
): Promise<CopyResult> {
	const source = await sql<
		{
			structured_email_id: string;
			raw_source: string;
			uid: number;
			flags: string;
			internal_date: Date;
			size: number | null;
		}[]
	>`
		SELECT structured_email_id, raw_source, uid, flags, internal_date, size
		FROM imap_mailbox_messages
		WHERE mailbox_id = ${sourceMailboxId} AND uid = ANY(${uids})
		  AND ${ownedMailbox(sql, sourceMailboxId, owner)}
		ORDER BY uid ASC`;
	const locked = await sql<{ uid_next: number; modseq: number }[]>`
		SELECT uid_next, modseq FROM imap_mailboxes
		WHERE id = ${destination.id}
		  AND user_id = ${owner.userId}
		  AND credential_id = ${owner.credentialId}
		FOR UPDATE`;
	if (!locked[0]) throw new Error("Destination mailbox not found");
	const restored = source
		.filter((row) => row.raw_source === "structured")
		.map((row) => row.structured_email_id);
	const junkVerdict = receivedViewJunkVerdict(destination);
	if (destination.credentialId && junkVerdict !== null && restored.length > 0) {
		await sql`
			DELETE FROM imap_mailbox_removals
			WHERE credential_id = ${destination.credentialId}
			  AND structured_email_id = ANY(${restored})`;
		await sql`
			SELECT id FROM structured_emails
			WHERE id = ANY(${restored}) AND user_id = ${owner.userId}
			ORDER BY id
			FOR UPDATE`;
		await sql`
			UPDATE structured_emails
			SET is_junk = ${junkVerdict},
			    junk_reason = 'user',
			    junk_updated_at = now()
			WHERE id = ANY(${restored})
			  AND user_id = ${owner.userId}
			  AND is_junk IS DISTINCT FROM ${junkVerdict}`;
	}
	let nextUid = locked[0].uid_next;
	let nextModseq = locked[0].modseq;
	const sourceUid: number[] = [];
	const destinationUid: number[] = [];
	for (const row of source) {
		const inserted = await sql<{ uid: number }[]>`
			INSERT INTO imap_mailbox_messages
				(id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
			VALUES (${`${destination.id}:${nextUid}`}, ${destination.id},
				${row.structured_email_id}, ${row.raw_source}, ${nextUid},
				${row.flags}, ${row.internal_date}, ${row.size}, ${nextModseq + 1})
			ON CONFLICT (mailbox_id, structured_email_id) DO NOTHING
			RETURNING uid`;
		if (inserted.length === 0) continue;
		sourceUid.push(row.uid);
		destinationUid.push(nextUid);
		nextUid++;
		nextModseq++;
	}
	await sql`
		UPDATE imap_mailboxes
		SET uid_next = ${nextUid}, modseq = ${nextModseq}, updated_at = now()
		WHERE id = ${destination.id}`;
	return { uidValidity: destination.uidValidity, sourceUid, destinationUid };
}

async function deleteWithin(
	sql: postgres.TransactionSql,
	owner: MailboxOwner,
	mailboxId: string,
	uids: number[] | null,
	onlyDeletedFlag: boolean,
	pending: PendingExpunge[],
): Promise<number[]> {
	const deleted = await sql<
		{ mailbox_id: string; uid: number; structured_email_id: string; raw_source: string }[]
	>`
		DELETE FROM imap_mailbox_messages
		WHERE mailbox_id = ${mailboxId}
		  AND ${ownedMailbox(sql, mailboxId, owner)}
		  AND ${onlyDeletedFlag ? sql`flags::jsonb ? '\\Deleted'` : sql`TRUE`}
		  AND ${uids ? sql`uid = ANY(${uids})` : sql`TRUE`}
		RETURNING mailbox_id, uid, structured_email_id, raw_source`;
	const mirrored = await removeFromMirroredMailboxes(sql, mailboxId, deleted);
	await journalDeletes(sql, [...deleted, ...mirrored], pending);
	await deleteOrphanedAppended(sql, deleted);
	return deleted.map((row) => row.uid).sort((x, y) => x - y);
}

function parseFlags(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? parsed.filter((f): f is string => typeof f === "string")
			: [];
	} catch {
		return [];
	}
}

export class MailStore {
	private sql: postgres.Sql;
	private options: MailStoreOptions;
	private journal = new ExpungeJournal();
	/** Called with the mailboxes that lost messages, after the change commits. */
	onExpunged: ((mailboxIds: string[]) => void) | null = null;

	constructor(databaseUrl: string, options: MailStoreOptions) {
		this.sql = postgres(databaseUrl, { max: 10, idle_timeout: 30 });
		this.options = options;
	}

	/** Runs a transaction and records the EXPUNGEs it queued once it commits. */
	private async journaled<T>(
		fn: (sql: postgres.TransactionSql, pending: PendingExpunge[]) => Promise<T>,
	): Promise<T> {
		const pending: PendingExpunge[] = [];
		const result = (await this.sql.begin((sql) => fn(sql, pending))) as T;
		if (pending.length > 0) {
			this.journal.record(pending);
			this.onExpunged?.([...new Set(pending.map((entry) => entry.mailboxId))]);
		}
		return result;
	}

	async ensureMailbox(
		principal: AuthenticatedMailbox,
		path = "INBOX",
		scopeId: string | null = null,
	): Promise<MailboxRow> {
		const lower = principal.loginAddress.toLowerCase();
		await this.sql`
			UPDATE imap_mailboxes
			SET credential_id = ${principal.credentialId},
			    scope_id = ${scopeId},
			    updated_at = now()
			WHERE user_id = ${principal.userId}
			  AND address = ${lower}
			  AND path = ${path}
			  AND credential_id IS NULL
			  AND NOT EXISTS (
				SELECT 1 FROM imap_mailboxes managed
				WHERE managed.credential_id = ${principal.credentialId}
				  AND managed.path = ${path})`;
		const rows = await this.sql<
			{
				id: string;
				uid_validity: number;
				uid_next: number;
				modseq: number;
				scope_id: string | null;
			}[]
		>`
			INSERT INTO imap_mailboxes
				(id, user_id, address, path, uid_validity, credential_id, scope_id)
			VALUES (${randomUUID()}, ${principal.userId}, ${lower}, ${path},
				${Math.floor(Date.now() / 1000)}, ${principal.credentialId}, ${scopeId})
			ON CONFLICT (credential_id, path) DO UPDATE
			SET updated_at = now(), scope_id = excluded.scope_id
			RETURNING id, uid_validity, uid_next, modseq, scope_id`;
		const row = rows[0];
		if (!row) throw new Error("Failed to ensure mailbox");
		return {
			id: row.id,
			address: lower,
			path,
			uidValidity: row.uid_validity,
			uidNext: row.uid_next,
			modseq: row.modseq,
			credentialId: principal.credentialId,
			scopeId: row.scope_id,
		};
	}

	async ensureDefaultMailboxes(
		principal: AuthenticatedMailbox,
	): Promise<MailboxRow[]> {
		const result: MailboxRow[] = [];
		for (const path of DEFAULT_FOLDERS) {
			result.push(await this.ensureMailbox(principal, path));
		}
		return result;
	}

	async ensureScopeMailboxes(
		principal: AuthenticatedMailbox,
	): Promise<MailboxRow[]> {
		const scopeIds = principal.scopes.map((scope) => scope.id);
		await this.journaled(async (sql, pending) => {
			await sql`
				SELECT id FROM imap_mailboxes
				WHERE credential_id = ${principal.credentialId}
				ORDER BY id
				FOR UPDATE`;
			const stale = await sql<{ id: string }[]>`
				SELECT id FROM imap_mailboxes
				WHERE credential_id = ${principal.credentialId}
				  AND scope_id IS NOT NULL
				  AND NOT (scope_id = ANY(${scopeIds}))`;
			const staleIds = stale.map((row) => row.id);
			if (staleIds.length > 0) {
				await sql`
					DELETE FROM imap_mailbox_messages
					WHERE mailbox_id = ANY(${staleIds})`;
				await sql`
					DELETE FROM imap_mailboxes
					WHERE id = ANY(${staleIds})`;
			}
			const revoked = await sql<DeletedRow[]>`
				DELETE FROM imap_mailbox_messages mm
				USING imap_mailboxes mb, structured_emails se
				WHERE mm.mailbox_id = mb.id
				  AND mb.credential_id = ${principal.credentialId}
				  AND mb.user_id = ${principal.userId}
				  AND mm.raw_source = 'structured'
				  AND se.id = mm.structured_email_id
				  AND NOT ${visibleToScopes(sql, principal.scopes)}
				RETURNING mm.mailbox_id, mm.uid`;
			await journalDeletes(sql, revoked, pending);
		});
		const result: MailboxRow[] = [];
		for (const scope of principal.scopes) {
			result.push(
				await this.ensureMailbox(principal, scopeMailboxPath(scope), scope.id),
			);
		}
		return result;
	}

	async listMailboxes(principal: AuthenticatedMailbox): Promise<MailboxRow[]> {
		type Row = {
			id: string;
			address: string;
			path: string;
			uid_validity: number;
			uid_next: number;
			modseq: number;
			credential_id: string | null;
			scope_id: string | null;
		};
		const rows = await this.sql<Row[]>`
				SELECT id, address, path, uid_validity, uid_next, modseq,
				       credential_id, scope_id
				FROM imap_mailboxes
				WHERE user_id = ${principal.userId}
				  AND credential_id = ${principal.credentialId}
				ORDER BY path ASC`;
		return rows.map((row) => ({
			id: row.id,
			address: row.address,
			path: row.path,
			uidValidity: row.uid_validity,
			uidNext: row.uid_next,
			modseq: row.modseq,
			credentialId: row.credential_id,
			scopeId: row.scope_id,
		}));
	}

	async getMailboxByPath(
		principal: AuthenticatedMailbox,
		path: string,
	): Promise<MailboxRow | null> {
		type Row = {
			id: string;
			address: string;
			path: string;
			uid_validity: number;
			uid_next: number;
			modseq: number;
			credential_id: string | null;
			scope_id: string | null;
		};
		const rows = await this.sql<Row[]>`
				SELECT id, address, path, uid_validity, uid_next, modseq,
				       credential_id, scope_id
				FROM imap_mailboxes
				WHERE user_id = ${principal.userId}
				  AND credential_id = ${principal.credentialId}
				  AND path = ${path}
				LIMIT 1`;
		const row = rows[0];
		if (!row) return null;
		return {
			id: row.id,
			address: row.address,
			path: row.path,
			uidValidity: row.uid_validity,
			uidNext: row.uid_next,
			modseq: row.modseq,
			credentialId: row.credential_id,
			scopeId: row.scope_id,
		};
	}

	async createMailbox(
		principal: AuthenticatedMailbox,
		path: string,
	): Promise<boolean> {
		const rows = await this.sql<{ id: string }[]>`
				INSERT INTO imap_mailboxes
					(id, user_id, address, path, uid_validity, credential_id)
				VALUES (${randomUUID()}, ${principal.userId},
					${principal.loginAddress.toLowerCase()}, ${path},
					${Math.floor(Date.now() / 1000)}, ${principal.credentialId})
				ON CONFLICT (credential_id, path) DO NOTHING
				RETURNING id`;
		return rows.length > 0;
	}

	async renameMailbox(
		principal: AuthenticatedMailbox,
		path: string,
		newPath: string,
	): Promise<boolean> {
		const rows = await this.sql<{ id: string }[]>`
				UPDATE imap_mailboxes
				SET path = ${newPath} || substr(path, char_length(${path}) + 1),
				    updated_at = now()
				WHERE user_id = ${principal.userId}
				  AND credential_id = ${principal.credentialId}
				  AND (path = ${path} OR left(path, char_length(${path}) + 1) = ${`${path}/`})
				  AND scope_id IS NULL
				RETURNING id`;
		return rows.length > 0;
	}

	async deleteMailbox(
		principal: AuthenticatedMailbox,
		path: string,
	): Promise<boolean> {
		return this.sql.begin(async (sql) => {
			const rows = await sql<{ id: string }[]>`
					SELECT id FROM imap_mailboxes
					WHERE user_id = ${principal.userId}
					  AND credential_id = ${principal.credentialId}
					  AND path = ${path}
					FOR UPDATE`;
			const mailboxId = rows[0]?.id;
			if (!mailboxId) return false;
			const deleted = await sql<
				{ structured_email_id: string; raw_source: string }[]
			>`
				DELETE FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId}
				RETURNING structured_email_id, raw_source`;
			await sql`DELETE FROM imap_mailboxes WHERE id = ${mailboxId}`;
			const appendedIds = deleted
				.filter((row) => row.raw_source === "appended")
				.map((row) => row.structured_email_id);
			if (appendedIds.length > 0) {
				await sql`
					DELETE FROM imap_appended_messages am
					WHERE am.id = ANY(${appendedIds})
					  AND NOT EXISTS (
						SELECT 1 FROM imap_mailbox_messages mm
						WHERE mm.raw_source = 'appended'
						  AND mm.structured_email_id = am.id)`;
			}
			return true;
		});
	}

	async appendMessage(
		mailbox: MailboxRow,
		owner: MailboxOwner,
		raw: string,
		flags: string[],
		internalDate: Date,
	): Promise<{ uidValidity: number; uid: number }> {
		const userId = owner.userId;
		return this.sql.begin(async (sql) => {
			await sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
			const usage = await sql<{ message_count: string; total_bytes: string }[]>`
				SELECT count(*) AS message_count,
				       coalesce(sum(am.size), 0)::bigint AS total_bytes
				FROM imap_appended_messages am
				WHERE am.user_id = ${userId}
				  AND EXISTS (
					SELECT 1 FROM imap_mailbox_messages mm
					WHERE mm.raw_source = 'appended'
					  AND mm.structured_email_id = am.id)`;
			const incomingBytes = Buffer.byteLength(raw);
			const messageCount = Number(usage[0]?.message_count ?? 0);
			const totalBytes = Number(usage[0]?.total_bytes ?? 0);
			if (
				messageCount >= this.options.appendMaxMessagesPerUser ||
				totalBytes + incomingBytes > this.options.appendMaxBytesPerUser
			) {
				throw new AppendQuotaError("APPEND quota exceeded");
			}
			const appendedId = randomUUID();
			await sql`
				INSERT INTO imap_appended_messages (id, user_id, raw_content, size)
				VALUES (${appendedId}, ${userId}, ${raw}, ${incomingBytes})`;
			const locked = await sql<{ uid_next: number; modseq: number }[]>`
				SELECT uid_next, modseq FROM imap_mailboxes
				WHERE id = ${mailbox.id}
				  AND user_id = ${userId}
				  AND credential_id = ${owner.credentialId}
				FOR UPDATE`;
			if (!locked[0]) throw new Error("Mailbox not found");
			const uid = locked[0].uid_next;
			const modseq = locked[0].modseq + 1;
			await sql`
				INSERT INTO imap_mailbox_messages
					(id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
				VALUES (${`${mailbox.id}:${uid}`}, ${mailbox.id}, ${appendedId},
					'appended', ${uid}, ${JSON.stringify(flags)}, ${internalDate},
					${incomingBytes}, ${modseq})`;
			await sql`
				UPDATE imap_mailboxes
				SET uid_next = ${uid + 1}, modseq = ${modseq}, updated_at = now()
				WHERE id = ${mailbox.id}`;
			return { uidValidity: mailbox.uidValidity, uid };
		});
	}

	async copyMessages(
		owner: MailboxOwner,
		sourceMailboxId: string,
		destination: MailboxRow,
		uids: number[],
	): Promise<CopyResult> {
		return this.journaled(async (sql) => {
			await lockMailboxes(sql, owner, [sourceMailboxId, destination.id]);
			return copyWithin(sql, owner, sourceMailboxId, destination, uids);
		});
	}

	/**
	 * MOVE in one transaction: copies into the destination, then removes the
	 * source messages (and their mirrors). Returns the source UIDs removed.
	 */
	async moveMessages(
		owner: MailboxOwner,
		sourceMailboxId: string,
		destination: MailboxRow,
		uids: number[],
	): Promise<CopyResult & { expunged: number[] }> {
		return this.journaled(async (sql, pending) => {
			await lockMailboxes(sql, owner, [sourceMailboxId, destination.id]);
			const copied = await copyWithin(
				sql,
				owner,
				sourceMailboxId,
				destination,
				uids,
			);
			const expunged = await deleteWithin(
				sql,
				owner,
				sourceMailboxId,
				uids,
				false,
				pending,
			);
			return { ...copied, expunged };
		});
	}

	async deleteMessages(
		owner: MailboxOwner,
		mailboxId: string,
		uids: number[],
	): Promise<number[]> {
		return this.journaled(async (sql, pending) => {
			await lockMailboxes(sql, owner, [mailboxId]);
			return deleteWithin(sql, owner, mailboxId, uids, false, pending);
		});
	}

	async syncMailbox(
		mailbox: MailboxRow,
		principal: AuthenticatedMailbox,
	): Promise<number> {
		const scope = mailbox.scopeId
			? principal.scopes.find((item) => item.id === mailbox.scopeId)
			: null;
		const view = receivedViewJunkVerdict(mailbox);
		if (view === null && !scope) return 0;
		const junk = view === true;

		const scopes = scope ? [scope] : principal.scopes;
		if (scopes.length === 0) return 0;

		return this.journaled(async (sql, pending) => {
			const locked = await sql<
				{ uid_next: number; modseq: number; id: string; path: string }[]
			>`
				SELECT uid_next, modseq, id, path FROM imap_mailboxes
				WHERE user_id = ${principal.userId}
				  AND credential_id = ${principal.credentialId}
				  AND (id = ${mailbox.id}
				       OR (${view !== null} AND scope_id IS NULL
				           AND path IN ('INBOX', 'Junk')))
				ORDER BY id
				FOR UPDATE`;
			if (!locked.some((row) => row.id === mailbox.id)) return 0;
			if (view !== null) {
				const inbox = locked.find((row) => row.path === "INBOX");
				const junkBox = locked.find((row) => row.path === "Junk");
				if (inbox && junkBox) {
					await transferBetweenViews(sql, inbox.id, junkBox.id, true, pending);
					await transferBetweenViews(sql, junkBox.id, inbox.id, false, pending);
				}
			} else {
				const misplaced = await sql<DeletedRow[]>`
					DELETE FROM imap_mailbox_messages mm
					USING structured_emails se
					WHERE mm.mailbox_id = ${mailbox.id}
					  AND mm.raw_source = 'structured'
					  AND se.id = mm.structured_email_id
					  AND se.is_junk IS TRUE
					RETURNING mm.mailbox_id, mm.uid`;
				await journalDeletes(sql, misplaced, pending);
			}
			const current = await sql<{ uid_next: number; modseq: number }[]>`
				SELECT uid_next, modseq FROM imap_mailboxes WHERE id = ${mailbox.id}`;
			const uidNext =
				current[0]?.uid_next ??
				locked.find((row) => row.id === mailbox.id)?.uid_next ??
				1;
			const modseq =
				current[0]?.modseq ??
				locked.find((row) => row.id === mailbox.id)?.modseq ??
				0;
			const inserted = await sql<{ uid: number }[]>`
				WITH new_msgs AS (
					SELECT se.id AS seid, se.created_at,
					       octet_length(se.raw_content) AS size,
					       row_number() OVER (ORDER BY se.created_at ASC, se.id ASC) AS rn
					FROM structured_emails se
					WHERE se.user_id = ${principal.userId}
					  AND se.raw_content IS NOT NULL
					  AND ${visibleToScopes(sql, scopes)}
					  AND ${
							junk
								? sql`se.is_junk IS TRUE`
								: sql`se.is_junk IS NOT TRUE
					  AND (se.is_junk IS NOT NULL OR se.created_at < now() - interval '2 minutes')`
						}
					  AND NOT EXISTS (
						SELECT 1 FROM imap_mailbox_messages mm
						WHERE mm.mailbox_id = ${mailbox.id}
						  AND mm.structured_email_id = se.id)
					  AND NOT EXISTS (
						SELECT 1 FROM imap_mailbox_removals removal
						WHERE removal.credential_id = ${principal.credentialId}
						  AND removal.structured_email_id = se.id)
				)
				INSERT INTO imap_mailbox_messages
					(id, mailbox_id, structured_email_id, uid, internal_date, size, modseq)
				SELECT ${mailbox.id} || ':' || (${uidNext} + rn - 1),
				       ${mailbox.id}, seid, ${uidNext} + rn - 1, created_at, size,
				       ${modseq} + rn
				FROM new_msgs
				RETURNING uid`;
			if (inserted.length > 0) {
				await sql`
					UPDATE imap_mailboxes
					SET uid_next = ${uidNext + inserted.length},
					    modseq = ${modseq + inserted.length},
					    updated_at = now()
					WHERE id = ${mailbox.id}`;
				if (mailbox.scopeId && mailbox.credentialId) {
					await sql`
						UPDATE imap_mailbox_messages scoped
						SET flags = canonical.flags
						FROM imap_mailboxes inbox,
						     imap_mailbox_messages canonical
						WHERE scoped.mailbox_id = ${mailbox.id}
						  AND inbox.credential_id = ${mailbox.credentialId}
						  AND inbox.path = 'INBOX'
						  AND canonical.mailbox_id = inbox.id
						  AND canonical.raw_source = scoped.raw_source
						  AND canonical.structured_email_id = scoped.structured_email_id`;
				}
			}
			return inserted.length;
		});
	}

	async searchMessages(
		owner: MailboxOwner,
		mailboxId: string,
		query: SearchNode[],
	): Promise<number[]> {
		const where = buildSearchWhere(this.sql, query);
		const rows = await this.sql<{ uid: number }[]>`
			SELECT mm.uid
			FROM imap_mailbox_messages mm
			LEFT JOIN structured_emails se
				ON mm.raw_source = 'structured' AND se.id = mm.structured_email_id
			LEFT JOIN imap_appended_messages am
				ON mm.raw_source = 'appended' AND am.id = mm.structured_email_id
			WHERE mm.mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)}
			  AND (${where})
			ORDER BY mm.uid ASC`;
		return rows.map((row) => row.uid);
	}

	async getUpdatesSince(
		owner: MailboxOwner,
		mailboxId: string,
		sinceModseq: number,
	): Promise<JournalEntry[]> {
		const rows = await this.sql<{ uid: number; modseq: number }[]>`
			SELECT uid, modseq FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId} AND modseq > ${sinceModseq}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)}
			ORDER BY modseq ASC
			LIMIT 500`;
		const updates: JournalEntry[] = rows.map((row) => ({
			command: "EXISTS" as const,
			uid: row.uid,
			modseq: row.modseq,
			_id: `${mailboxId}:${row.uid}`,
		}));
		const upTo =
			rows.length === 500
				? (rows[rows.length - 1]?.modseq ?? Number.POSITIVE_INFINITY)
				: Number.POSITIVE_INFINITY;
		const expunges = this.journal
			.since(mailboxId, sinceModseq)
			.filter((entry) => entry.modseq <= upTo);
		if (expunges.length > 0) {
			const owned = await this.sql<{ id: string }[]>`
				SELECT id FROM imap_mailboxes
				WHERE id = ${mailboxId}
				  AND user_id = ${owner.userId}
				  AND credential_id = ${owner.credentialId}`;
			if (owned.length > 0) {
				for (const entry of expunges) {
					updates.push({
						command: "EXPUNGE",
						uid: entry.uid,
						modseq: entry.modseq,
						_id: `${mailboxId}:expunge:${entry.uid}:${entry.modseq}`,
					});
				}
			}
		}
		return updates.sort((x, y) => x.modseq - y.modseq);
	}

	async listMessages(
		owner: MailboxOwner,
		mailboxId: string,
		uids?: number[],
	): Promise<MessageMeta[]> {
		const rows = uids
			? await this.sql<MessageRow[]>`
				SELECT uid, structured_email_id, raw_source, flags, internal_date, size
				FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId} AND uid = ANY(${uids})
				  AND ${ownedMailbox(this.sql, mailboxId, owner)}
				ORDER BY uid ASC`
			: await this.sql<MessageRow[]>`
				SELECT uid, structured_email_id, raw_source, flags, internal_date, size
				FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId}
				  AND ${ownedMailbox(this.sql, mailboxId, owner)}
				ORDER BY uid ASC`;
		return rows.map(toMessageMeta);
	}

	async *listMessagesInBatches(
		owner: MailboxOwner,
		mailboxId: string,
		uids: number[],
		batchSize = MESSAGE_BATCH_SIZE,
	): AsyncGenerator<MessageMeta[]> {
		const sorted = [...uids].sort((a, b) => a - b);
		for (let index = 0; index < sorted.length; index += batchSize) {
			const rows = await this.listMessages(
				owner,
				mailboxId,
				sorted.slice(index, index + batchSize),
			);
			if (rows.length > 0) yield rows;
		}
	}

	async listUids(owner: MailboxOwner, mailboxId: string): Promise<number[]> {
		const rows = await this.sql<{ uid: number }[]>`
			SELECT uid FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)}
			ORDER BY uid ASC`;
		return rows.map((row) => row.uid);
	}

	async countMessages(owner: MailboxOwner, mailboxId: string): Promise<number> {
		const rows = await this.sql<{ count: string }[]>`
			SELECT count(*) AS count FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)}`;
		return Number(rows[0]?.count ?? 0);
	}

	async unseenCount(owner: MailboxOwner, mailboxId: string): Promise<number> {
		const rows = await this.sql<{ count: string }[]>`
			SELECT count(*) AS count FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)}
			  AND NOT (flags::jsonb ? '\\Seen')`;
		return Number(rows[0]?.count ?? 0);
	}

	async getRawContent(
		messageId: string,
		rawSource: string,
		principal: AuthenticatedMailbox,
	): Promise<Buffer | null> {
		const rows =
			rawSource === "appended"
				? await this.sql<{ raw_content: string | null }[]>`
					SELECT raw_content FROM imap_appended_messages
					WHERE id = ${messageId} AND user_id = ${principal.userId} LIMIT 1`
				: await this.sql<{ raw_content: string | null }[]>`
					SELECT se.raw_content FROM structured_emails se
					WHERE se.id = ${messageId}
					  AND se.user_id = ${principal.userId}
					  AND ${visibleToScopes(this.sql, principal.scopes)}
					LIMIT 1`;
		const raw = rows[0]?.raw_content;
		return typeof raw === "string" ? Buffer.from(raw, "utf8") : null;
	}

	async updateFlags(
		owner: MailboxOwner,
		mailboxId: string,
		uids: number[],
		action: FlagAction,
		flags: string[],
	): Promise<Array<{ uid: number; flags: string[] }>> {
		const mailbox = await this.sql<
			{ credential_id: string | null; mirrored: boolean }[]
		>`SELECT credential_id, (path = 'INBOX' OR scope_id IS NOT NULL) AS mirrored
			FROM imap_mailboxes
			WHERE id = ${mailboxId}
			  AND user_id = ${owner.userId}
			  AND credential_id = ${owner.credentialId}`;
		if (!mailbox[0]) return [];
		const result: Array<{ uid: number; flags: string[] }> = [];
		for await (const rows of this.listMessagesInBatches(
			owner,
			mailboxId,
			uids,
		)) {
			for (const row of rows) {
				let next: string[];
				if (action === "set") next = [...flags];
				else if (action === "add")
					next = [...new Set([...row.flags, ...flags])];
				else next = row.flags.filter((flag) => !flags.includes(flag));
				result.push({ uid: row.uid, flags: next });
				if (JSON.stringify(next) === JSON.stringify(row.flags)) continue;
				if (
					mailbox[0].credential_id &&
					mailbox[0].mirrored &&
					row.rawSource === "structured"
				) {
					await this.sql`
						UPDATE imap_mailbox_messages mm
						SET flags = ${JSON.stringify(next)}
						FROM imap_mailboxes mb
						WHERE mm.mailbox_id = mb.id
						  AND mb.user_id = ${owner.userId}
						  AND mb.credential_id = ${mailbox[0].credential_id}
						  AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
						  AND mm.raw_source = ${row.rawSource}
						  AND mm.structured_email_id = ${row.structuredEmailId}`;
				} else {
					await this.sql`
						UPDATE imap_mailbox_messages
						SET flags = ${JSON.stringify(next)}
						WHERE mailbox_id = ${mailboxId} AND uid = ${row.uid}
						  AND ${ownedMailbox(this.sql, mailboxId, owner)}`;
				}
			}
		}
		return result;
	}

	async addFlag(
		owner: MailboxOwner,
		mailboxId: string,
		uid: number,
		flag: string,
	): Promise<void> {
		await this.updateFlags(owner, mailboxId, [uid], "add", [flag]);
	}

	async expunge(
		owner: MailboxOwner,
		mailboxId: string,
		requestedUids?: number[],
	): Promise<number[]> {
		return this.journaled(async (sql, pending) => {
			await lockMailboxes(sql, owner, [mailboxId]);
			return deleteWithin(
				sql,
				owner,
				mailboxId,
				requestedUids ?? null,
				true,
				pending,
			);
		});
	}

	async cleanupOrphanedAppendedMessages(): Promise<number> {
		const rows = await this.sql<{ id: string }[]>`
			DELETE FROM imap_appended_messages am
			WHERE NOT EXISTS (
				SELECT 1 FROM imap_mailbox_messages mm
				WHERE mm.raw_source = 'appended'
				  AND mm.structured_email_id = am.id)
			RETURNING id`;
		return rows.length;
	}

	async end(): Promise<void> {
		await this.sql.end();
	}
}
