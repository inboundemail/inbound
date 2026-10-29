import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { withClient } from "@/scripts/db/lib";

const args = process.argv.slice(2);
const values = new Map<string, string>();
const switches = new Set<string>();
const valueOptions = new Set(["--user", "--credential", "--after", "--limit", "--batch-size", "--yes"]);
const switchOptions = new Set(["--apply", "--dry-run", "--all"]);
for (let index = 0; index < args.length; index++) {
	const argument = args[index];
	const equal = argument.indexOf("=");
	const name = equal < 0 ? argument : argument.slice(0, equal);
	if (switchOptions.has(name) && equal < 0) {
		if (switches.has(name)) throw new Error(`Duplicate option ${name}`);
		switches.add(name);
	} else if (valueOptions.has(name)) {
		const value = equal < 0 ? args[++index] : argument.slice(equal + 1);
		if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
		if (values.has(name)) throw new Error(`Duplicate option ${name}`);
		values.set(name, value);
	} else {
		throw new Error(`Unknown option ${argument}`);
	}
}

const apply = switches.has("--apply");
const onlyUser = values.get("--user");
const onlyCredential = values.get("--credential");
const after = values.get("--after") ?? "";
const limit = Number(values.get("--limit") ?? 25);
const batchSize = Number(values.get("--batch-size") ?? 500);
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL_UNPOOLED to a direct database connection");
const host = new URL(url).hostname;
if (/-pooler\./i.test(host)) throw new Error("Use a direct, not pooled, database connection");
if (apply && values.get("--yes") !== host) {
	throw new Error(`Apply requires --yes=${host}. Pause mailbox and legacy HTTP writes during this one-off import.`);
}
if (apply && switches.has("--dry-run")) throw new Error("Choose --apply or --dry-run, not both");
if (apply && !onlyUser && !onlyCredential && !switches.has("--all")) {
	throw new Error("Apply requires --user, --credential, or explicit --all");
}
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("--limit must be 1–1000 credentials");
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("--batch-size must be 1–1000 messages");

function textArray(values: string[]) {
	return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

await withClient(url, async (client) => {
	const db = drizzle(client);
	await db.execute(sql`SET statement_timeout = '30s'`);
	await db.execute(sql`SET lock_timeout = '2s'`);
	const credentials = await db.execute<{
		id: string;
		user_id: string;
	}>(sql`
		SELECT id, user_id FROM imap_credentials
		WHERE type = 'mailbox' AND enabled AND id > ${after}
			${onlyUser ? sql`AND user_id = ${onlyUser}` : sql``}
			${onlyCredential ? sql`AND id = ${onlyCredential}` : sql``}
		ORDER BY id LIMIT ${limit}`);
	console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", host, credentials: credentials.rowCount, batchSize }));
	for (const credential of credentials.rows) {
		const owner = credential.user_id;
		const id = credential.id;
		if (!apply) {
			const result = await db.execute(sql`
				SELECT count(*)::int AS visible, count(*) FILTER (WHERE se.is_read)::int AS seen,
					count(*) FILTER (WHERE se.is_archived)::int AS archived
				FROM structured_emails se
				WHERE se.user_id = ${owner} AND se.raw_content IS NOT NULL AND se.guard_blocked IS NOT TRUE
					AND se.is_junk IS NOT TRUE AND (se.is_junk IS NOT NULL OR se.created_at < now() - interval '2 minutes')
					AND NOT EXISTS (SELECT 1 FROM imap_mailbox_removals r WHERE r.credential_id = ${id} AND r.structured_email_id = se.id)
					AND EXISTS (SELECT 1 FROM imap_credential_scopes s JOIN email_domains d ON d.id = s.domain_id
						WHERE s.credential_id = ${id} AND d.user_id = ${owner} AND d.status = 'verified'
							AND EXISTS (SELECT 1 FROM unnest(array_append(coalesce(se.envelope_recipients, '{}'::text[]), se.recipient)) e(address)
								WHERE (s.type = 'address' AND lower(e.address) = lower(s.address)) OR
									(s.type = 'domain' AND split_part(lower(e.address), '@', 2) = lower(d.domain)
									AND split_part(lower(e.address), '@', 1) <> 'dmarc')))`);
			console.log(JSON.stringify({ credentialId: id, ...result.rows[0], note: "Visible-source estimate; apply preserves other flags and existing Archive copies" }));
			continue;
		}
		await db.execute(sql`SELECT id FROM imap_ensure(${owner}, ${id})`);
		const views = await db.execute<{ id: string }>(sql`
			SELECT id FROM imap_mailboxes WHERE user_id = ${owner} AND credential_id = ${id}
				AND (path = 'INBOX' OR scope_id IS NOT NULL) ORDER BY (path = 'INBOX') DESC, id`);
		for (const view of views.rows) {
			await db.execute(sql`SELECT id FROM imap_sync(${owner}, ${id}, ${view.id})`);
		}
		let cursor = "";
		let seen = 0;
		let archived = 0;
		for (;;) {
			const processed = await db.transaction(async (tx) => {
				const locked = await tx.execute<{ path: string }>(sql`
					SELECT id, path FROM imap_mailboxes WHERE user_id = ${owner} AND credential_id = ${id}
						AND (path IN ('INBOX', 'Junk', 'Archive') OR scope_id IS NOT NULL) ORDER BY id FOR UPDATE`);
				if (!locked.rows.some((folder) => folder.path === "Archive")) throw new Error(`Archive missing for credential ${id}`);
				const selected = await tx.execute<{ id: string; is_read: boolean; is_archived: boolean }>(sql`
					SELECT DISTINCT se.id, se.is_read, se.is_archived
					FROM imap_mailbox_messages mm JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
					JOIN structured_emails se ON se.id = mm.structured_email_id AND se.user_id = ${owner}
					WHERE mb.user_id = ${owner} AND mb.credential_id = ${id} AND mm.raw_source = 'structured'
						AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
						AND se.id > ${cursor} AND (se.is_read OR se.is_archived)
					ORDER BY se.id LIMIT ${batchSize}`);
				if (!selected.rows.length) return null;
				const reads = selected.rows.filter((row) => row.is_read).map((row) => row.id);
				const archives = selected.rows.filter((row) => row.is_archived).map((row) => row.id);
				if (reads.length) {
					await tx.execute(sql`
						WITH changed AS MATERIALIZED (
							SELECT mm.id, mm.mailbox_id, imap_normalize_flags(ARRAY(SELECT jsonb_array_elements_text(mm.flags::jsonb)) || ARRAY['\\Seen']) AS flags,
								row_number() OVER (PARTITION BY mm.mailbox_id ORDER BY mm.uid)::int AS ordinal
							FROM imap_mailbox_messages mm JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
							WHERE mb.user_id = ${owner} AND mb.credential_id = ${id} AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
								AND mm.raw_source = 'structured' AND mm.structured_email_id = ANY(${textArray(reads)})
								AND NOT mm.flags::jsonb ? '\\Seen'
						), bumped AS (
							UPDATE imap_mailboxes mb SET modseq = mb.modseq + counts.total, updated_at = now()
							FROM (SELECT mailbox_id, count(*)::int AS total FROM changed GROUP BY mailbox_id) counts
							WHERE mb.id = counts.mailbox_id RETURNING mb.id, mb.modseq, counts.total
						)
						UPDATE imap_mailbox_messages mm SET flags = to_jsonb(changed.flags)::text, modseq = bumped.modseq - bumped.total + changed.ordinal
						FROM changed JOIN bumped ON bumped.id = changed.mailbox_id WHERE mm.id = changed.id`);
				}
				if (archives.length) {
					await tx.execute(sql`
						WITH source AS MATERIALIZED (
							SELECT DISTINCT ON (mm.structured_email_id) mm.*
							FROM imap_mailbox_messages mm JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
							WHERE mb.user_id = ${owner} AND mb.credential_id = ${id} AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
								AND mm.raw_source = 'structured' AND mm.structured_email_id = ANY(${textArray(archives)})
							ORDER BY mm.structured_email_id, (mb.path = 'INBOX') DESC, mm.uid
						), destination AS MATERIALIZED (
							SELECT * FROM imap_mailboxes WHERE user_id = ${owner} AND credential_id = ${id} AND path = 'Archive'
						), candidates AS MATERIALIZED (
							SELECT source.*, row_number() OVER (ORDER BY source.structured_email_id)::int AS ordinal
							FROM source, destination WHERE NOT EXISTS (SELECT 1 FROM imap_mailbox_messages target
								WHERE target.mailbox_id = destination.id AND target.structured_email_id = source.structured_email_id)
						), inserted AS (
							INSERT INTO imap_mailbox_messages (id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
							SELECT destination.id || ':' || (destination.uid_next + candidates.ordinal - 1), destination.id,
								candidates.structured_email_id, 'structured', destination.uid_next + candidates.ordinal - 1,
								candidates.flags, candidates.internal_date, candidates.size, destination.modseq + candidates.ordinal
							FROM candidates, destination RETURNING uid
						)
						UPDATE imap_mailboxes SET uid_next = uid_next + (SELECT count(*) FROM inserted)::int,
							modseq = modseq + (SELECT count(*) FROM inserted)::int, updated_at = now()
						WHERE id = (SELECT id FROM destination)`);
					await tx.execute(sql`
						INSERT INTO imap_mailbox_removals (credential_id, structured_email_id)
						SELECT ${id}, email_id FROM unnest(${textArray(archives)}) AS selected(email_id) ON CONFLICT DO NOTHING`);
					await tx.execute(sql`
						DELETE FROM imap_mailbox_messages mm USING imap_mailboxes mb
						WHERE mm.mailbox_id = mb.id AND mb.user_id = ${owner} AND mb.credential_id = ${id}
							AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL) AND mm.raw_source = 'structured'
							AND mm.structured_email_id = ANY(${textArray(archives)})`);
				}
				return { cursor: selected.rows.at(-1)!.id, seen: reads.length, archived: archives.length };
			});
			if (!processed) break;
			cursor = processed.cursor;
			seen += processed.seen;
			archived += processed.archived;
		}
		console.log(JSON.stringify({ credentialId: id, seen, archived, resumeAfter: id }));
	}
	console.log(JSON.stringify({ complete: true, resumeAfter: credentials.rows.at(-1)?.id ?? after }));
});
