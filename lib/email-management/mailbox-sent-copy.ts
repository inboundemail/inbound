import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const SENT_MAILBOX_PATH = "Sent";
const MESSAGE_ID_HEADER = /(?:^|\r?\n)message-id[ \t]*:/i;

function envLimit(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

const APPEND_MAX_BYTES_PER_USER = envLimit(
	"IMAP_APPEND_MAX_BYTES_PER_USER",
	250 * 1024 * 1024,
);
const APPEND_MAX_MESSAGES_PER_USER = envLimit(
	"IMAP_APPEND_MAX_MESSAGES_PER_USER",
	5_000,
);

export interface SentCopyCredential {
	userId: string;
	credentialId: string;
	type: "mailbox" | "smtp";
	accessMode: "read" | "read_write";
}

export type SentCopyResult =
	| { status: "saved"; uid: number; uidValidity: number }
	| { status: "failed"; reason: string };

export function savesSentCopy(
	credential: SentCopyCredential | null | undefined,
): credential is SentCopyCredential {
	return credential?.type === "mailbox" && credential.accessMode === "read_write";
}

function headerBlock(raw: string): string {
	const end = raw.search(/\r?\n\r?\n/);
	return end < 0 ? raw : raw.slice(0, end);
}

export function ensureMessageIdHeader<T extends string | Uint8Array>(
	raw: T,
	fallbackId: string,
): T {
	const headers =
		typeof raw === "string"
			? headerBlock(raw)
			: headerBlock(Buffer.from(raw).toString("latin1"));
	if (MESSAGE_ID_HEADER.test(headers)) return raw;
	const header = `Message-ID: <${fallbackId}>\r\n`;
	if (typeof raw === "string") return `${header}${raw}` as T;
	return Buffer.concat([Buffer.from(header, "latin1"), raw]) as unknown as T;
}

async function saveSentCopy(input: {
	credential: SentCopyCredential;
	raw: string | Uint8Array;
	sentEmailId: string;
	date?: Date;
}): Promise<SentCopyResult> {
	const { credential, sentEmailId } = input;
	try {
		const raw =
			typeof input.raw === "string"
				? input.raw
				: new TextDecoder("utf-8", { fatal: true }).decode(input.raw);
		if (raw.includes("\u0000")) throw new Error("Sent copy MIME must not contain NUL bytes");
		const date = (input.date ?? new Date()).toISOString();
		const [, , appended] = await db.batch([
			db.execute(sql`SELECT set_config('statement_timeout', '5s', true), set_config('lock_timeout', '4s', true)`),
			db.execute(sql`SELECT id FROM imap_ensure(${credential.userId}, ${credential.credentialId})`),
			db.execute(sql`
				SELECT uid, uid_validity
				FROM imap_append(${credential.userId}, ${credential.credentialId},
					(SELECT id FROM imap_mailboxes WHERE user_id = ${credential.userId}
						AND credential_id = ${credential.credentialId} AND path = ${SENT_MAILBOX_PATH} AND scope_id IS NULL),
					${raw}, ARRAY[${"\\Seen"}]::text[], ${date}::timestamp,
					${APPEND_MAX_BYTES_PER_USER}::bigint, ${APPEND_MAX_MESSAGES_PER_USER}::integer)`),
		]);
		const row = appended.rows[0];
		if (!row) throw new Error("Sent mailbox not found");
		console.log("📁 Saved Sent copy:", {
			sentEmailId,
			credentialId: credential.credentialId,
			uid: row.uid,
		});
		return {
			status: "saved",
			uid: Number(row.uid),
			uidValidity: Number(row.uid_validity),
		};
	} catch (error) {
		const reason = error instanceof Error ? error.message : "Unknown error";
		console.error("⚠️ Sent copy not saved; the message was still delivered:", {
			sentEmailId,
			credentialId: credential.credentialId,
			reason,
		});
		return { status: "failed", reason };
	}
}

export async function saveSentCopies(input: {
	userId: string;
	credential?: SentCopyCredential | null;
	fromAddress: string;
	raw: string | Uint8Array;
	sentEmailId: string;
}): Promise<void> {
	try {
		if (input.credential) {
			if (savesSentCopy(input.credential)) {
				await saveSentCopy({ ...input, credential: input.credential });
			}
			return;
		}
		const [, matches] = await db.batch([
			db.execute(sql`SELECT set_config('statement_timeout', '5s', true)`),
			db.execute(sql`
				SELECT id FROM imap_credentials
				WHERE user_id = ${input.userId} AND enabled AND type = 'mailbox'
					AND access_mode = 'read_write'
					AND lower(coalesce(nullif(sending_address, ''), login_address)) = lower(${input.fromAddress})
				ORDER BY id`),
		]);
		for (const match of matches.rows) {
			if (typeof match.id !== "string") continue;
			await saveSentCopy({
				...input,
				credential: {
					userId: input.userId,
					credentialId: match.id,
					type: "mailbox",
					accessMode: "read_write",
				},
			});
		}
	} catch (error) {
		console.error("Sent copy lookup failed; delivery was already accepted", {
			sentEmailId: input.sentEmailId,
			reason: error instanceof Error ? error.message : "Unknown error",
		});
	}
}
