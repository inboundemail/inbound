import postgres from "postgres";
import type { AuthenticatedMailbox } from "./auth.ts";
import {
	DEFAULT_FOLDERS,
	normalizeFlags,
	normalizeMailboxPath,
	type FlagAction,
} from "./mailbox-rules.ts";
import { buildSearchWhere, type SearchNode } from "./search.ts";

export {
	DEFAULT_FOLDERS,
	SPECIAL_USE,
	scopeMailboxPath,
	type FlagAction,
} from "./mailbox-rules.ts";

export interface MailboxRow {
	id: string;
	address: string;
	path: string;
	uidValidity: number;
	uidNext: number;
	modseq: number;
	credentialId: string | null;
	scopeId: string | null;
	subscribed?: boolean;
}

type StoredMailbox = {
	id: string;
	address: string;
	path: string;
	uid_validity: number;
	uid_next: number;
	modseq: number;
	credential_id: string | null;
	scope_id: string | null;
	subscribed: boolean;
};

function toMailbox(row: StoredMailbox): MailboxRow {
	return {
		id: row.id,
		address: row.address,
		path: row.path,
		uidValidity: row.uid_validity,
		uidNext: row.uid_next,
		modseq: row.modseq,
		credentialId: row.credential_id,
		scopeId: row.scope_id,
		subscribed: row.subscribed,
	};
}

export interface JournalEntry {
	command: "EXISTS" | "FETCH" | "EXPUNGE";
	uid: number;
	modseq: number;
	_id: string;
	flags?: string[];
}

export interface MessageMeta {
	uid: number;
	structuredEmailId: string;
	rawSource: string;
	flags: string[];
	internalDate: Date;
	size: number | null;
}

interface MailStoreOptions {
	appendMaxBytesPerUser: number;
	appendMaxMessagesPerUser: number;
}

export class AppendQuotaError extends Error {}
export class MailboxResyncError extends Error {}

export type MailboxOwner = Pick<
	AuthenticatedMailbox,
	"userId" | "credentialId"
>;
export const MESSAGE_BATCH_SIZE = 500;

function ownedMailbox(
	sql: postgres.Sql,
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

function parseFlags(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? parsed.filter((flag): flag is string => typeof flag === "string")
			: [];
	} catch {
		return [];
	}
}

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

export function receivedViewJunkVerdict(
	mailbox: Pick<MailboxRow, "path" | "scopeId" | "credentialId">,
): boolean | null {
	if (!mailbox.credentialId || mailbox.scopeId) return null;
	if (mailbox.path === "INBOX") return false;
	if (mailbox.path === "Junk") return true;
	return null;
}

type CopyResult = {
	uidValidity: number;
	sourceUid: number[];
	destinationUid: number[];
};

export class MailStore {
	private sql: postgres.Sql;
	private options: MailStoreOptions;

	constructor(databaseUrl: string, options: MailStoreOptions) {
		this.sql = postgres(databaseUrl, { max: 10, idle_timeout: 30 });
		this.options = options;
	}

	async ensureAllMailboxes(
		principal: AuthenticatedMailbox,
	): Promise<MailboxRow[]> {
		const rows = await this.sql<StoredMailbox[]>`
			SELECT * FROM imap_ensure(${principal.userId}, ${principal.credentialId})`;
		return rows.map(toMailbox);
	}

	async ensureMailbox(
		principal: AuthenticatedMailbox,
		path = "INBOX",
		_scopeId: string | null = null,
	): Promise<MailboxRow> {
		const normalized = normalizeMailboxPath(path);
		const rows = await this.ensureAllMailboxes(principal);
		const mailbox = rows.find((row) => row.path === normalized);
		if (!mailbox) throw new Error("Mailbox not found");
		return mailbox;
	}

	async ensureDefaultMailboxes(
		principal: AuthenticatedMailbox,
	): Promise<MailboxRow[]> {
		return (await this.ensureAllMailboxes(principal)).filter((row) =>
			DEFAULT_FOLDERS.some((path) => path === row.path),
		);
	}

	async ensureScopeMailboxes(
		principal: AuthenticatedMailbox,
	): Promise<MailboxRow[]> {
		return (await this.ensureAllMailboxes(principal)).filter(
			(row) => row.scopeId !== null,
		);
	}

	async listMailboxes(principal: AuthenticatedMailbox): Promise<MailboxRow[]> {
		const rows = await this.sql<StoredMailbox[]>`
			SELECT id, address, path, uid_validity, uid_next, modseq,
			       credential_id, scope_id, subscribed
			FROM imap_mailboxes
			WHERE user_id = ${principal.userId} AND credential_id = ${principal.credentialId}
			ORDER BY path ASC`;
		return rows.map(toMailbox);
	}

	async getMailboxByPath(
		principal: AuthenticatedMailbox,
		path: string,
	): Promise<MailboxRow | null> {
		const rows = await this.sql<StoredMailbox[]>`
			SELECT id, address, path, uid_validity, uid_next, modseq,
			       credential_id, scope_id, subscribed
			FROM imap_mailboxes
			WHERE user_id = ${principal.userId} AND credential_id = ${principal.credentialId}
			  AND path = ${normalizeMailboxPath(path)} LIMIT 1`;
		return rows[0] ? toMailbox(rows[0]) : null;
	}

	private async folder(
		principal: AuthenticatedMailbox,
		operation: string,
		path: string,
		newPath: string | null = null,
		subscribed: boolean | null = null,
	): Promise<boolean> {
		const rows = await this.sql<StoredMailbox[]>`
			SELECT * FROM imap_folder(${principal.userId}, ${principal.credentialId},
				${operation}, ${normalizeMailboxPath(path)},
				${newPath === null ? null : normalizeMailboxPath(newPath)}, ${subscribed})`;
		return rows.length > 0;
	}

	async createMailbox(
		principal: AuthenticatedMailbox,
		path: string,
	): Promise<boolean> {
		return this.folder(principal, "create", path);
	}

	async renameMailbox(
		principal: AuthenticatedMailbox,
		path: string,
		newPath: string,
	): Promise<boolean> {
		return this.folder(principal, "rename", path, newPath);
	}

	async deleteMailbox(
		principal: AuthenticatedMailbox,
		path: string,
	): Promise<boolean> {
		return this.folder(principal, "delete", path);
	}

	async subscribeMailbox(
		principal: AuthenticatedMailbox,
		path: string,
		subscribed: boolean,
	): Promise<boolean> {
		return this.folder(principal, "subscribe", path, null, subscribed);
	}

	async appendMessage(
		mailbox: MailboxRow,
		owner: MailboxOwner,
		raw: string,
		flags: string[],
		internalDate: Date,
	): Promise<{ uidValidity: number; uid: number }> {
		try {
			const rows = await this.sql<{ uid: number; uid_validity: number }[]>`
				SELECT * FROM imap_append(${owner.userId}, ${owner.credentialId}, ${mailbox.id},
					${raw}, ${normalizeFlags(flags)}::text[], ${internalDate.toISOString()}::timestamp,
					${this.options.appendMaxBytesPerUser}::bigint, ${this.options.appendMaxMessagesPerUser}::integer)`;
			if (!rows[0]) throw new Error("Mailbox not found");
			return { uid: rows[0].uid, uidValidity: rows[0].uid_validity };
		} catch (err) {
			if (
				err instanceof Error &&
				/^APPEND(?: mailbox)? quota exceeded$/.test(err.message)
			) {
				throw new AppendQuotaError(err.message);
			}
			throw err;
		}
	}

	private async transferMessages(
		owner: MailboxOwner,
		sourceMailboxId: string,
		destination: MailboxRow,
		uids: number[],
		move: boolean,
	): Promise<CopyResult> {
		const rows = await this.sql<
			{ source_uid: number; destination_uid: number }[]
		>`
			SELECT * FROM imap_transfer(${owner.userId}, ${owner.credentialId},
				${sourceMailboxId}, ${destination.id}, ${uids}::integer[], ${move})`;
		return {
			uidValidity: destination.uidValidity,
			sourceUid: rows.map((row) => row.source_uid),
			destinationUid: rows.map((row) => row.destination_uid),
		};
	}

	async copyMessages(
		owner: MailboxOwner,
		sourceMailboxId: string,
		destination: MailboxRow,
		uids: number[],
	): Promise<CopyResult> {
		return this.transferMessages(
			owner,
			sourceMailboxId,
			destination,
			uids,
			false,
		);
	}

	async moveMessages(
		owner: MailboxOwner,
		sourceMailboxId: string,
		destination: MailboxRow,
		uids: number[],
	): Promise<CopyResult & { expunged: number[] }> {
		const result = await this.transferMessages(
			owner,
			sourceMailboxId,
			destination,
			uids,
			true,
		);
		const rows = await this.sql<{ uid: number }[]>`
			SELECT uid FROM imap_mailbox_expunges
			WHERE mailbox_id = ${sourceMailboxId} AND uid = ANY(${uids})
			  AND ${ownedMailbox(this.sql, sourceMailboxId, owner)} ORDER BY uid ASC`;
		return { ...result, expunged: rows.map((row) => row.uid) };
	}

	async deleteMessages(
		owner: MailboxOwner,
		mailboxId: string,
		uids: number[],
	): Promise<number[]> {
		const rows = await this.sql<{ uid: number }[]>`
			SELECT * FROM imap_expunge(${owner.userId}, ${owner.credentialId}, ${mailboxId}, ${uids}::integer[], ${true})`;
		return rows.map((row) => row.uid).sort((a, b) => a - b);
	}

	async syncMailbox(
		mailbox: MailboxRow,
		principal: AuthenticatedMailbox,
	): Promise<number> {
		const rows = await this.sql<StoredMailbox[]>`
			SELECT * FROM imap_sync(${principal.userId}, ${principal.credentialId}, ${mailbox.id})`;
		return Math.max(
			0,
			(rows[0]?.uid_next ?? mailbox.uidNext) - mailbox.uidNext,
		);
	}

	async searchMessages(
		owner: MailboxOwner,
		mailboxId: string,
		query: SearchNode[],
	): Promise<number[]> {
		const where = buildSearchWhere(this.sql, query);
		const rows = await this.sql<{ uid: number }[]>`
			SELECT mm.uid FROM imap_mailbox_messages mm
			LEFT JOIN structured_emails se
				ON mm.raw_source = 'structured' AND se.id = mm.structured_email_id
			LEFT JOIN imap_appended_messages am
				ON mm.raw_source = 'appended' AND am.id = mm.structured_email_id
			WHERE mm.mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)} AND (${where})
			ORDER BY mm.uid ASC`;
		return rows.map((row) => row.uid);
	}

	async getUpdatesSince(
		owner: MailboxOwner,
		mailboxId: string,
		sinceModseq: number,
	): Promise<JournalEntry[]> {
		const rows = await this.sql<
			{
				expunge_floor: number;
				command: JournalEntry["command"] | null;
				uid: number | null;
				modseq: number | null;
				flags: string | null;
			}[]
		>`
			SELECT mb.expunge_floor, changes.command, changes.uid, changes.modseq, changes.flags
			FROM imap_mailboxes mb
			LEFT JOIN LATERAL (
				WITH journal AS NOT MATERIALIZED (
					SELECT 'EXISTS' AS command, mm.uid,
					       COALESCE(mm.created_modseq, mm.modseq) AS modseq, mm.flags
					FROM imap_mailbox_messages mm
					WHERE mm.mailbox_id = mb.id AND mm.modseq > ${sinceModseq}
					  AND COALESCE(mm.created_modseq, mm.modseq) > ${sinceModseq}
					UNION ALL
					SELECT 'FETCH', mm.uid, mm.modseq, mm.flags
					FROM imap_mailbox_messages mm
					WHERE mm.mailbox_id = mb.id AND mm.modseq > ${sinceModseq}
					  AND mm.modseq > COALESCE(mm.created_modseq, mm.modseq)
					UNION ALL
					SELECT 'EXPUNGE', e.uid, e.modseq, NULL::text
					FROM imap_mailbox_expunges e
					WHERE e.mailbox_id = mb.id AND e.modseq > ${sinceModseq}
				), page AS (
					SELECT modseq FROM journal ORDER BY modseq ASC, uid ASC LIMIT ${MESSAGE_BATCH_SIZE}
				), up_to AS (
					SELECT max(modseq) AS modseq FROM page
				)
				SELECT journal.* FROM journal
				WHERE journal.modseq <= (SELECT modseq FROM up_to)
			) changes ON true
			WHERE mb.id = ${mailboxId} AND mb.user_id = ${owner.userId}
			  AND mb.credential_id = ${owner.credentialId}
			ORDER BY changes.modseq ASC, changes.uid ASC`;
		if (!rows[0] || sinceModseq < rows[0].expunge_floor) {
			throw new MailboxResyncError(
				"Mailbox history expired; please select it again",
			);
		}
		return rows.flatMap((row) => {
			if (!row.command || row.uid === null || row.modseq === null) return [];
			return [
				{
					command: row.command,
					uid: row.uid,
					modseq: row.modseq,
					_id: `${mailboxId}:${row.uid}:${row.modseq}`,
					...(row.command === "FETCH"
						? { flags: parseFlags(row.flags ?? "[]") }
						: {}),
				},
			];
		});
	}

	async listMessages(
		owner: MailboxOwner,
		mailboxId: string,
		uids?: number[],
	): Promise<MessageMeta[]> {
		const rows = uids
			? await this.sql<MessageRow[]>`
				SELECT uid, structured_email_id, raw_source, flags, internal_date, size
				FROM imap_mailbox_messages WHERE mailbox_id = ${mailboxId} AND uid = ANY(${uids})
				  AND ${ownedMailbox(this.sql, mailboxId, owner)} ORDER BY uid ASC`
			: await this.sql<MessageRow[]>`
				SELECT uid, structured_email_id, raw_source, flags, internal_date, size
				FROM imap_mailbox_messages WHERE mailbox_id = ${mailboxId}
				  AND ${ownedMailbox(this.sql, mailboxId, owner)} ORDER BY uid ASC`;
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
			SELECT uid FROM imap_mailbox_messages WHERE mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)} ORDER BY uid ASC`;
		return rows.map((row) => row.uid);
	}

	async countMessages(owner: MailboxOwner, mailboxId: string): Promise<number> {
		const rows = await this.sql<{ count: string }[]>`
			SELECT count(*) AS count FROM imap_mailbox_messages WHERE mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)}`;
		return Number(rows[0]?.count ?? 0);
	}

	async unseenCount(owner: MailboxOwner, mailboxId: string): Promise<number> {
		const rows = await this.sql<{ count: string }[]>`
			SELECT count(*) AS count FROM imap_mailbox_messages WHERE mailbox_id = ${mailboxId}
			  AND ${ownedMailbox(this.sql, mailboxId, owner)} AND NOT (flags::jsonb ? '\\Seen')`;
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
				WHERE se.id = ${messageId} AND se.user_id = ${principal.userId}
				  AND imap_visible(${principal.userId}, ${principal.credentialId}, se.id) LIMIT 1`;
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
		const rows = await this.sql<MessageRow[]>`
			SELECT * FROM imap_flags(${owner.userId}, ${owner.credentialId}, ${mailboxId},
				${uids}::integer[], ${action}, ${normalizeFlags(flags)}::text[])`;
		return rows.map((row) => ({ uid: row.uid, flags: parseFlags(row.flags) }));
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
		const rows = await this.sql<{ uid: number }[]>`
			SELECT * FROM imap_expunge(${owner.userId}, ${owner.credentialId}, ${mailboxId},
				${requestedUids ?? null}::integer[], ${false})`;
		return rows.map((row) => row.uid).sort((a, b) => a - b);
	}

	async end(): Promise<void> {
		await this.sql.end();
	}
}
