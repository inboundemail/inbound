import { randomUUID } from "node:crypto";
import postgres from "postgres";

export interface MailboxRow {
	id: string;
	address: string;
	path: string;
	uidValidity: number;
	uidNext: number;
	modseq: number;
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

export type FlagAction = "set" | "add" | "remove";

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

	constructor(databaseUrl: string) {
		this.sql = postgres(databaseUrl, { max: 10, idle_timeout: 30 });
	}

	async ensureMailbox(
		address: string,
		userId: string,
		path = "INBOX",
	): Promise<MailboxRow> {
		const lower = address.toLowerCase();
		const rows = await this.sql<
			{ id: string; uid_validity: number; uid_next: number; modseq: number }[]
		>`
			INSERT INTO imap_mailboxes (id, user_id, address, path, uid_validity)
			VALUES (${randomUUID()}, ${userId}, ${lower}, ${path}, ${Math.floor(Date.now() / 1000)})
			ON CONFLICT (address, path) DO UPDATE SET updated_at = now()
			RETURNING id, uid_validity, uid_next, modseq`;
		const row = rows[0];
		if (!row) throw new Error("Failed to ensure mailbox");
		return {
			id: row.id,
			address: lower,
			path,
			uidValidity: row.uid_validity,
			uidNext: row.uid_next,
			modseq: row.modseq,
		};
	}

	async ensureDefaultMailboxes(
		address: string,
		userId: string,
	): Promise<MailboxRow[]> {
		const result: MailboxRow[] = [];
		for (const path of DEFAULT_FOLDERS) {
			result.push(await this.ensureMailbox(address, userId, path));
		}
		return result;
	}

	async listMailboxes(address: string): Promise<MailboxRow[]> {
		const rows = await this.sql<
			{
				id: string;
				path: string;
				uid_validity: number;
				uid_next: number;
				modseq: number;
			}[]
		>`
			SELECT id, path, uid_validity, uid_next, modseq FROM imap_mailboxes
			WHERE address = ${address.toLowerCase()}
			ORDER BY path ASC`;
		return rows.map((row) => ({
			id: row.id,
			address: address.toLowerCase(),
			path: row.path,
			uidValidity: row.uid_validity,
			uidNext: row.uid_next,
			modseq: row.modseq,
		}));
	}

	async getMailboxByPath(
		address: string,
		path: string,
	): Promise<MailboxRow | null> {
		const rows = await this.sql<
			{
				id: string;
				path: string;
				uid_validity: number;
				uid_next: number;
				modseq: number;
			}[]
		>`
			SELECT id, path, uid_validity, uid_next, modseq FROM imap_mailboxes
			WHERE address = ${address.toLowerCase()} AND path = ${path}
			LIMIT 1`;
		const row = rows[0];
		if (!row) return null;
		return {
			id: row.id,
			address: address.toLowerCase(),
			path: row.path,
			uidValidity: row.uid_validity,
			uidNext: row.uid_next,
			modseq: row.modseq,
		};
	}

	async createMailbox(
		address: string,
		userId: string,
		path: string,
	): Promise<boolean> {
		const rows = await this.sql<{ id: string }[]>`
			INSERT INTO imap_mailboxes (id, user_id, address, path, uid_validity)
			VALUES (${randomUUID()}, ${userId}, ${address.toLowerCase()}, ${path}, ${Math.floor(Date.now() / 1000)})
			ON CONFLICT (address, path) DO NOTHING
			RETURNING id`;
		return rows.length > 0;
	}

	async renameMailbox(
		address: string,
		path: string,
		newPath: string,
	): Promise<boolean> {
		const rows = await this.sql<{ id: string }[]>`
			UPDATE imap_mailboxes SET path = ${newPath}, updated_at = now()
			WHERE address = ${address.toLowerCase()} AND path = ${path}
			RETURNING id`;
		return rows.length > 0;
	}

	async deleteMailbox(address: string, path: string): Promise<boolean> {
		return this.sql.begin(async (sql) => {
			const rows = await sql<{ id: string }[]>`
				DELETE FROM imap_mailboxes
				WHERE address = ${address.toLowerCase()} AND path = ${path}
				RETURNING id`;
			const mailboxId = rows[0]?.id;
			if (!mailboxId) return false;
			await sql`DELETE FROM imap_mailbox_messages WHERE mailbox_id = ${mailboxId}`;
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
			const appendedId = randomUUID();
			await sql`
				INSERT INTO imap_appended_messages (id, user_id, raw_content, size)
				VALUES (${appendedId}, ${userId}, ${raw}, ${Buffer.byteLength(raw)})`;
			const locked = await sql<{ uid_next: number; modseq: number }[]>`
				SELECT uid_next, modseq FROM imap_mailboxes WHERE id = ${mailbox.id} FOR UPDATE`;
			const uid = locked[0]?.uid_next ?? 1;
			const modseq = (locked[0]?.modseq ?? 0) + 1;
			await sql`
				INSERT INTO imap_mailbox_messages
					(id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
				VALUES (${`${mailbox.id}:${uid}`}, ${mailbox.id}, ${appendedId},
					'appended', ${uid}, ${JSON.stringify(flags)}, ${internalDate},
					${Buffer.byteLength(raw)}, ${modseq})`;
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
		await this.sql`
			DELETE FROM imap_mailbox_messages
			WHERE mailbox_id = ${mailboxId} AND uid = ANY(${uids})`;
	}

	async syncMailbox(mailbox: MailboxRow): Promise<number> {
		if (mailbox.path !== "INBOX") return 0;
		return this.sql.begin(async (sql) => {
			const locked = await sql<{ uid_next: number; modseq: number }[]>`
				SELECT uid_next, modseq FROM imap_mailboxes WHERE id = ${mailbox.id} FOR UPDATE`;
			const uidNext = locked[0]?.uid_next ?? 1;
			const modseq = locked[0]?.modseq ?? 0;
			const inserted = await sql<{ uid: number }[]>`
				WITH new_msgs AS (
					SELECT se.id AS seid, se.created_at,
					       octet_length(se.raw_content) AS size,
					       row_number() OVER (ORDER BY se.created_at ASC, se.id ASC) AS rn
					FROM structured_emails se
					WHERE lower(se.recipient) = ${mailbox.address}
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
			}
			return inserted.length;
		});
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
	): Promise<string | null> {
		const rows =
			rawSource === "appended"
				? await this.sql<{ raw_content: string | null }[]>`
					SELECT raw_content FROM imap_appended_messages
					WHERE id = ${messageId} LIMIT 1`
				: await this.sql<{ raw_content: string | null }[]>`
					SELECT raw_content FROM structured_emails
					WHERE id = ${messageId} LIMIT 1`;
		return rows[0]?.raw_content ?? null;
	}

	async updateFlags(
		mailboxId: string,
		uids: number[],
		action: FlagAction,
		flags: string[],
	): Promise<number[]> {
		const rows = await this.listMessages(mailboxId, uids);
		const modified: number[] = [];
		for (const row of rows) {
			let next: string[];
			if (action === "set") next = [...flags];
			else if (action === "add")
				next = [...new Set([...row.flags, ...flags])];
			else next = row.flags.filter((flag) => !flags.includes(flag));
			if (JSON.stringify(next) === JSON.stringify(row.flags)) continue;
			await this.sql`
				UPDATE imap_mailbox_messages
				SET flags = ${JSON.stringify(next)}
				WHERE mailbox_id = ${mailboxId} AND uid = ${row.uid}`;
			modified.push(row.uid);
		}
		return modified;
	}

	async addFlag(mailboxId: string, uid: number, flag: string): Promise<void> {
		await this.updateFlags(mailboxId, [uid], "add", [flag]);
	}

	async expunge(mailboxId: string): Promise<number[]> {
		const rows = await this.listMessages(mailboxId);
		const doomed = rows
			.filter((row) => row.flags.includes("\\Deleted"))
			.map((row) => row.uid);
		if (doomed.length > 0) {
			await this.sql`
				DELETE FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId} AND uid = ANY(${doomed})`;
		}
		return doomed;
	}

	async end(): Promise<void> {
		await this.sql.end();
	}
}
