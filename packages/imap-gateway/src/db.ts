import { randomUUID } from "node:crypto";
import postgres from "postgres";

export interface MailboxRow {
	id: string;
	address: string;
	uidValidity: number;
	uidNext: number;
}

export interface MessageMeta {
	uid: number;
	structuredEmailId: string;
	flags: string[];
	internalDate: Date;
	size: number | null;
}

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

	async ensureMailbox(address: string, userId: string): Promise<MailboxRow> {
		const lower = address.toLowerCase();
		const rows = await this.sql<
			{ id: string; uid_validity: number; uid_next: number }[]
		>`
			INSERT INTO imap_mailboxes (id, user_id, address, path, uid_validity)
			VALUES (${randomUUID()}, ${userId}, ${lower}, 'INBOX', ${Math.floor(Date.now() / 1000)})
			ON CONFLICT (address, path) DO UPDATE SET updated_at = now()
			RETURNING id, uid_validity, uid_next`;
		const row = rows[0];
		if (!row) throw new Error("Failed to ensure mailbox");
		return {
			id: row.id,
			address: lower,
			uidValidity: row.uid_validity,
			uidNext: row.uid_next,
		};
	}

	async syncMailbox(mailbox: MailboxRow): Promise<number> {
		return this.sql.begin(async (sql) => {
			const locked = await sql<{ uid_next: number }[]>`
				SELECT uid_next FROM imap_mailboxes WHERE id = ${mailbox.id} FOR UPDATE`;
			const uidNext = locked[0]?.uid_next ?? 1;
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
					(id, mailbox_id, structured_email_id, uid, internal_date, size)
				SELECT ${mailbox.id} || ':' || (${uidNext} + rn - 1),
				       ${mailbox.id}, seid, ${uidNext} + rn - 1, created_at, size
				FROM new_msgs
				RETURNING uid`;
			if (inserted.length > 0) {
				await sql`
					UPDATE imap_mailboxes
					SET uid_next = ${uidNext + inserted.length}, updated_at = now()
					WHERE id = ${mailbox.id}`;
			}
			return inserted.length;
		});
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
						flags: string;
						internal_date: Date;
						size: number | null;
					}[]
				>`
				SELECT uid, structured_email_id, flags, internal_date, size
				FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId} AND uid = ANY(${uids})
				ORDER BY uid ASC`
			: await this.sql<
					{
						uid: number;
						structured_email_id: string;
						flags: string;
						internal_date: Date;
						size: number | null;
					}[]
				>`
				SELECT uid, structured_email_id, flags, internal_date, size
				FROM imap_mailbox_messages
				WHERE mailbox_id = ${mailboxId}
				ORDER BY uid ASC`;
		return rows.map((row) => ({
			uid: row.uid,
			structuredEmailId: row.structured_email_id,
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

	async getRawContent(structuredEmailId: string): Promise<string | null> {
		const rows = await this.sql<{ raw_content: string | null }[]>`
			SELECT raw_content FROM structured_emails
			WHERE id = ${structuredEmailId} LIMIT 1`;
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
				SET flags = ${JSON.stringify(next)}, modseq = modseq + 1
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
