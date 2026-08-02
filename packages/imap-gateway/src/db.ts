import postgres from "postgres";

export interface MessageRow {
	id: string;
	createdAt: Date;
}

export class MailStore {
	private sql: postgres.Sql;

	constructor(databaseUrl: string) {
		this.sql = postgres(databaseUrl, { max: 10, idle_timeout: 30 });
	}

	async listMessages(address: string): Promise<MessageRow[]> {
		const rows = await this.sql<{ id: string; created_at: Date }[]>`
			SELECT id, created_at FROM structured_emails
			WHERE lower(recipient) = ${address.toLowerCase()}
			  AND raw_content IS NOT NULL
			ORDER BY created_at ASC, id ASC`;
		return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
	}

	async getRawContent(id: string): Promise<string | null> {
		const rows = await this.sql<{ raw_content: string | null }[]>`
			SELECT raw_content FROM structured_emails WHERE id = ${id} LIMIT 1`;
		return rows[0]?.raw_content ?? null;
	}

	async end(): Promise<void> {
		await this.sql.end();
	}
}
