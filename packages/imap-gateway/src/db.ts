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
	command: "EXISTS";
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

	constructor(databaseUrl: string, options: MailStoreOptions) {
		this.sql = postgres(databaseUrl, { max: 10, idle_timeout: 30 });
		this.options = options;
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
		await this.sql.begin(async (sql) => {
			const stale = await sql<{ id: string }[]>`
				SELECT id FROM imap_mailboxes
				WHERE credential_id = ${principal.credentialId}
				  AND scope_id IS NOT NULL
				  AND NOT (scope_id = ANY(${scopeIds}))
				FOR UPDATE`;
			const staleIds = stale.map((row) => row.id);
			if (staleIds.length === 0) return;
			await sql`
				DELETE FROM imap_mailbox_messages
				WHERE mailbox_id = ANY(${staleIds})`;
			await sql`
				DELETE FROM imap_mailboxes
				WHERE id = ANY(${staleIds})`;
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
				UPDATE imap_mailboxes SET path = ${newPath}, updated_at = now()
				WHERE user_id = ${principal.userId}
				  AND credential_id = ${principal.credentialId}
				  AND path = ${path}
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
		userId: string,
		raw: string,
		flags: string[],
		internalDate: Date,
	): Promise<{ uidValidity: number; uid: number }> {
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
				SELECT uid_next, modseq FROM imap_mailboxes WHERE id = ${mailbox.id} FOR UPDATE`;
			const uid = locked[0]?.uid_next ?? 1;
			const modseq = (locked[0]?.modseq ?? 0) + 1;
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
		sourceMailboxId: string,
		destination: MailboxRow,
		uids: number[],
	): Promise<{
		uidValidity: number;
		sourceUid: number[];
		destinationUid: number[];
	}> {
		return this.sql.begin(async (sql) => {
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
				ORDER BY uid ASC`;
			const locked = await sql<{ uid_next: number; modseq: number }[]>`
				SELECT uid_next, modseq FROM imap_mailboxes WHERE id = ${destination.id} FOR UPDATE`;
			let nextUid = locked[0]?.uid_next ?? 1;
			let nextModseq = locked[0]?.modseq ?? 0;
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
			return {
				uidValidity: destination.uidValidity,
				sourceUid,
				destinationUid,
			};
		});
	}

	async deleteMessages(mailboxId: string, uids: number[]): Promise<void> {
		await this.sql.begin(async (sql) => {
			const deleted = await sql<
				{ structured_email_id: string; raw_source: string }[]
			>`
				DELETE FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId} AND uid = ANY(${uids})
				RETURNING structured_email_id, raw_source`;
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
		});
	}

	async syncMailbox(
		mailbox: MailboxRow,
		principal: AuthenticatedMailbox,
	): Promise<number> {
		const scope = mailbox.scopeId
			? principal.scopes.find((item) => item.id === mailbox.scopeId)
			: null;
		if (mailbox.path !== "INBOX" && !scope) return 0;

		const scopes = scope ? [scope] : principal.scopes;
		const addresses = scopes
			.filter((item) => item.type === "address" && item.address)
			.map((item) => item.address as string);
		const domains = scopes
			.filter((item) => item.type === "domain")
			.map((item) => item.domain);
		if (addresses.length === 0 && domains.length === 0) return 0;

		return this.sql.begin(async (sql) => {
			const locked = await sql<{ uid_next: number; modseq: number }[]>`
				SELECT uid_next, modseq FROM imap_mailboxes WHERE id = ${mailbox.id} FOR UPDATE`;
			const uidNext = locked[0]?.uid_next ?? 1;
			const modseq = locked[0]?.modseq ?? 0;
			const inserted = principal.credentialId
				? await sql<{ uid: number }[]>`
					WITH new_msgs AS (
						SELECT se.id AS seid, se.created_at,
						       octet_length(se.raw_content) AS size,
						       row_number() OVER (ORDER BY se.created_at ASC, se.id ASC) AS rn
						FROM structured_emails se
						WHERE se.user_id = ${principal.userId}
						  AND se.raw_content IS NOT NULL
						  AND (
							lower(se.recipient) = ANY(${addresses})
							OR split_part(lower(se.recipient), '@', 2) = ANY(${domains})
						  )
						  AND NOT EXISTS (
							SELECT 1 FROM imap_mailbox_messages mm
							WHERE mm.mailbox_id = ${mailbox.id}
							  AND mm.structured_email_id = se.id)
					)
					INSERT INTO imap_mailbox_messages
						(id, mailbox_id, structured_email_id, uid, internal_date, size, modseq)
					SELECT ${mailbox.id} || ':' || (${uidNext} + rn - 1),
					       ${mailbox.id}, seid, ${uidNext} + rn - 1, created_at, size,
					       ${modseq} + rn
					FROM new_msgs
					RETURNING uid`
				: await sql<{ uid: number }[]>`
				WITH new_msgs AS (
					SELECT se.id AS seid, se.created_at,
					       octet_length(se.raw_content) AS size,
					       row_number() OVER (ORDER BY se.created_at ASC, se.id ASC) AS rn
					FROM structured_emails se
					WHERE se.user_id = ${principal.userId}
					  AND lower(se.recipient) = ${principal.loginAddress.toLowerCase()}
					  AND se.raw_content IS NOT NULL
					  AND NOT EXISTS (
						SELECT 1 FROM imap_mailbox_messages mm
						WHERE mm.mailbox_id = ${mailbox.id}
						  AND mm.structured_email_id = se.id)
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
		mailboxId: string,
		query: SearchNode[],
	): Promise<number[]> {
		const where = buildSearchWhere(this.sql, query);
		const rows = await this.sql<{ uid: number }[]>`
			SELECT mm.uid
			FROM imap_mailbox_messages mm
			LEFT JOIN structured_emails se
				ON mm.raw_source = 'structured' AND se.id = mm.structured_email_id
			WHERE mm.mailbox_id = ${mailboxId} AND (${where})
			ORDER BY mm.uid ASC`;
		return rows.map((row) => row.uid);
	}

	async getUpdatesSince(
		mailboxId: string,
		sinceModseq: number,
	): Promise<JournalEntry[]> {
		const rows = await this.sql<{ uid: number; modseq: number }[]>`
			SELECT uid, modseq FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId} AND modseq > ${sinceModseq}
			ORDER BY modseq ASC
			LIMIT 500`;
		return rows.map((row) => ({
			command: "EXISTS" as const,
			uid: row.uid,
			modseq: row.modseq,
			_id: `${mailboxId}:${row.uid}`,
		}));
	}

	async listMessages(
		mailboxId: string,
		uids?: number[],
	): Promise<MessageMeta[]> {
		const rows = uids
			? await this.sql<
					{
						uid: number;
						structured_email_id: string;
						raw_source: string;
						flags: string;
						internal_date: Date;
						size: number | null;
					}[]
				>`
				SELECT uid, structured_email_id, raw_source, flags, internal_date, size
				FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId} AND uid = ANY(${uids})
				ORDER BY uid ASC`
			: await this.sql<
					{
						uid: number;
						structured_email_id: string;
						raw_source: string;
						flags: string;
						internal_date: Date;
						size: number | null;
					}[]
				>`
				SELECT uid, structured_email_id, raw_source, flags, internal_date, size
				FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId}
				ORDER BY uid ASC`;
		return rows.map((row) => ({
			uid: row.uid,
			structuredEmailId: row.structured_email_id,
			rawSource: row.raw_source,
			flags: parseFlags(row.flags),
			internalDate: row.internal_date,
			size: row.size,
		}));
	}

	async listUids(mailboxId: string): Promise<number[]> {
		const rows = await this.sql<{ uid: number }[]>`
			SELECT uid FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId}
			ORDER BY uid ASC`;
		return rows.map((row) => row.uid);
	}

	async countMessages(mailboxId: string): Promise<number> {
		const rows = await this.sql<{ count: string }[]>`
			SELECT count(*) AS count FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId}`;
		return Number(rows[0]?.count ?? 0);
	}

	async unseenCount(mailboxId: string): Promise<number> {
		const rows = await this.sql<{ count: string }[]>`
			SELECT count(*) AS count FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId}
			  AND NOT (flags::jsonb ? '\\Seen')`;
		return Number(rows[0]?.count ?? 0);
	}

	async getRawContent(
		messageId: string,
		rawSource: string,
		userId: string,
	): Promise<string | null> {
		const rows =
			rawSource === "appended"
				? await this.sql<{ raw_content: string | null }[]>`
					SELECT raw_content FROM imap_appended_messages
					WHERE id = ${messageId} AND user_id = ${userId} LIMIT 1`
				: await this.sql<{ raw_content: string | null }[]>`
					SELECT raw_content FROM structured_emails
					WHERE id = ${messageId} AND user_id = ${userId} LIMIT 1`;
		return rows[0]?.raw_content ?? null;
	}

	async updateFlags(
		mailboxId: string,
		uids: number[],
		action: FlagAction,
		flags: string[],
	): Promise<number[]> {
		const rows = await this.listMessages(mailboxId, uids);
		const mailbox = await this.sql<
			{ credential_id: string | null }[]
		>`SELECT credential_id FROM imap_mailboxes WHERE id = ${mailboxId}`;
		const modified: number[] = [];
		for (const row of rows) {
			let next: string[];
			if (action === "set") next = [...flags];
			else if (action === "add") next = [...new Set([...row.flags, ...flags])];
			else next = row.flags.filter((flag) => !flags.includes(flag));
			if (JSON.stringify(next) === JSON.stringify(row.flags)) continue;
			if (mailbox[0]?.credential_id && row.rawSource === "structured") {
				await this.sql`
					UPDATE imap_mailbox_messages mm
					SET flags = ${JSON.stringify(next)}
					FROM imap_mailboxes mb
					WHERE mm.mailbox_id = mb.id
					  AND mb.credential_id = ${mailbox[0].credential_id}
					  AND mm.raw_source = ${row.rawSource}
					  AND mm.structured_email_id = ${row.structuredEmailId}`;
			} else {
				await this.sql`
					UPDATE imap_mailbox_messages
					SET flags = ${JSON.stringify(next)}
					WHERE mailbox_id = ${mailboxId} AND uid = ${row.uid}`;
			}
			modified.push(row.uid);
		}
		return modified;
	}

	async addFlag(mailboxId: string, uid: number, flag: string): Promise<void> {
		await this.updateFlags(mailboxId, [uid], "add", [flag]);
	}

	async expunge(
		mailboxId: string,
		requestedUids?: number[],
	): Promise<number[]> {
		return this.sql.begin(async (sql) => {
			const deleted = requestedUids
				? await sql<
						{ uid: number; structured_email_id: string; raw_source: string }[]
					>`
					DELETE FROM imap_mailbox_messages
					WHERE mailbox_id = ${mailboxId}
					  AND flags::jsonb ? '\\Deleted'
					  AND uid = ANY(${requestedUids})
					RETURNING uid, structured_email_id, raw_source`
				: await sql<
						{ uid: number; structured_email_id: string; raw_source: string }[]
					>`
					DELETE FROM imap_mailbox_messages
					WHERE mailbox_id = ${mailboxId}
					  AND flags::jsonb ? '\\Deleted'
					RETURNING uid, structured_email_id, raw_source`;
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
			return deleted.map((row) => row.uid);
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
