/**
 * Merges legacy per-recipient structured_emails rows into one row per message per user.
 *
 * Dry run (default):  bun run scripts/merge-inbound-duplicates.ts
 * Apply:              bun run scripts/merge-inbound-duplicates.ts --apply
 * Options:            --user <userId>   only merge one user's emails
 *                     --limit <n>       stop after n groups
 *
 * For each duplicate group the earliest (or already-merged) row is kept. Its
 * envelope_recipients becomes the union of every row's recipients. Removed IDs
 * are recorded in structured_email_aliases so API lookups by an old ID resolve
 * to the kept email. Endpoint deliveries and IMAP mailbox messages are moved to
 * the kept row where that does not duplicate an existing one, and thread
 * message counts are recomputed. Each group is applied in one transaction.
 */
import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	emailThreads,
	endpointDeliveries,
	imapMailboxMessages,
	sentEmails,
	structuredEmailAliases,
	structuredEmails,
} from "@/lib/db/schema";
import { envelopeRecipientsOf, normalizeRecipientForDedupe } from "@/lib/email-management/inbound-dedupe";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const onlyUser = args.includes("--user") ? args[args.indexOf("--user") + 1] : undefined;
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Number.POSITIVE_INFINITY;

const groupKey = sql<string>`coalesce(${structuredEmails.messageId}, ${structuredEmails.sesEventId})`;

type Totals = {
	groups: number;
	rowsRemoved: number;
	deliveriesMoved: number;
	imapMoved: number;
	imapRemoved: number;
	threadsRecounted: number;
};

async function findGroups() {
	return db
		.select({ userId: structuredEmails.userId, key: groupKey, rows: count() })
		.from(structuredEmails)
		.where(onlyUser ? eq(structuredEmails.userId, onlyUser) : undefined)
		.groupBy(structuredEmails.userId, groupKey)
		.having(gt(count(), 1))
		.orderBy(desc(count()));
}

async function mergeGroup(userId: string, key: string, totals: Totals) {
	const rows = await db
		.select({
			id: structuredEmails.id,
			recipient: structuredEmails.recipient,
			envelopeRecipients: structuredEmails.envelopeRecipients,
			parseSuccess: structuredEmails.parseSuccess,
			isRead: structuredEmails.isRead,
			threadId: structuredEmails.threadId,
			createdAt: structuredEmails.createdAt,
		})
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.userId, userId),
				or(
					eq(structuredEmails.messageId, key),
					and(isNull(structuredEmails.messageId), eq(structuredEmails.sesEventId, key)),
				),
			),
		)
		.orderBy(asc(structuredEmails.createdAt), asc(structuredEmails.id));
	if (rows.length < 2) return;

	const canonical =
		rows.find((row) => row.envelopeRecipients) ??
		rows.find((row) => row.parseSuccess !== false) ??
		rows[0];
	const duplicates = rows.filter((row) => row.id !== canonical.id);
	const duplicateIds = duplicates.map((row) => row.id);
	const recipients = [
		...new Set(rows.flatMap((row) => envelopeRecipientsOf(row).map(normalizeRecipientForDedupe))),
	];

	const deliveries = await db
		.select({
			id: endpointDeliveries.id,
			emailId: endpointDeliveries.emailId,
			endpointId: endpointDeliveries.endpointId,
		})
		.from(endpointDeliveries)
		.where(inArray(endpointDeliveries.emailId, [canonical.id, ...duplicateIds]))
		.orderBy(desc(endpointDeliveries.updatedAt));
	const deliveredEndpoints = new Set(
		deliveries.filter((delivery) => delivery.emailId === canonical.id).map((delivery) => delivery.endpointId),
	);
	const deliveriesToMove: string[] = [];
	for (const delivery of deliveries) {
		if (delivery.emailId === canonical.id || deliveredEndpoints.has(delivery.endpointId)) continue;
		deliveredEndpoints.add(delivery.endpointId);
		deliveriesToMove.push(delivery.id);
	}

	const imapRows = await db
		.select({
			id: imapMailboxMessages.id,
			mailboxId: imapMailboxMessages.mailboxId,
			structuredEmailId: imapMailboxMessages.structuredEmailId,
		})
		.from(imapMailboxMessages)
		.where(
			and(
				eq(imapMailboxMessages.rawSource, "structured"),
				inArray(imapMailboxMessages.structuredEmailId, [canonical.id, ...duplicateIds]),
			),
		);
	const mailboxesWithCanonical = new Set(
		imapRows.filter((row) => row.structuredEmailId === canonical.id).map((row) => row.mailboxId),
	);
	const imapToMove: string[] = [];
	const imapToRemove: string[] = [];
	for (const row of imapRows) {
		if (row.structuredEmailId === canonical.id) continue;
		if (mailboxesWithCanonical.has(row.mailboxId)) {
			imapToRemove.push(row.id);
		} else {
			mailboxesWithCanonical.add(row.mailboxId);
			imapToMove.push(row.id);
		}
	}

	const threadIds = [...new Set(rows.map((row) => row.threadId).filter((id): id is string => !!id))];

	totals.groups += 1;
	totals.rowsRemoved += duplicateIds.length;
	totals.deliveriesMoved += deliveriesToMove.length;
	totals.imapMoved += imapToMove.length;
	totals.imapRemoved += imapToRemove.length;
	totals.threadsRecounted += threadIds.length;

	if (!apply) return;

	await db.batch([
		db
			.insert(structuredEmailAliases)
			.values(
				duplicates.map((row) => ({
					id: row.id,
					canonicalId: canonical.id,
					userId,
					recipient: row.recipient,
				})),
			)
			.onConflictDoNothing(),
		db
			.update(endpointDeliveries)
			.set({ emailId: canonical.id, updatedAt: new Date() })
			.where(inArray(endpointDeliveries.id, deliveriesToMove.length ? deliveriesToMove : ["__none__"])),
		db
			.delete(imapMailboxMessages)
			.where(inArray(imapMailboxMessages.id, imapToRemove.length ? imapToRemove : ["__none__"])),
		db
			.update(imapMailboxMessages)
			.set({ structuredEmailId: canonical.id })
			.where(inArray(imapMailboxMessages.id, imapToMove.length ? imapToMove : ["__none__"])),
		db.delete(structuredEmails).where(inArray(structuredEmails.id, duplicateIds)),
		db
			.update(structuredEmails)
			.set({
				envelopeRecipients: recipients,
				isRead: rows.some((row) => row.isRead),
				updatedAt: new Date(),
			})
			.where(eq(structuredEmails.id, canonical.id)),
		db
			.update(emailThreads)
			.set({
				messageCount: sql`(select count(*) from ${structuredEmails} where ${structuredEmails.threadId} = ${emailThreads.id}) + (select count(*) from ${sentEmails} where ${sentEmails.threadId} = ${emailThreads.id})`,
				updatedAt: new Date(),
			})
			.where(inArray(emailThreads.id, threadIds.length ? threadIds : ["__none__"])),
	]);
}

async function main() {
	const host = new URL(process.env.DATABASE_URL ?? "postgres://unset").hostname;
	console.log(`${apply ? "APPLYING" : "DRY RUN"} against database host ${host}${onlyUser ? ` for user ${onlyUser}` : ""}`);

	const groups = await findGroups();
	const toProcess = groups.slice(0, Number.isFinite(limit) ? limit : groups.length);
	const users = new Map<string, number>();
	for (const group of toProcess) users.set(group.userId, (users.get(group.userId) ?? 0) + group.rows - 1);
	console.log(`Found ${groups.length} duplicate groups; processing ${toProcess.length}.`);
	console.log(
		"Users with the most rows to merge:",
		[...users.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
	);

	const totals: Totals = {
		groups: 0,
		rowsRemoved: 0,
		deliveriesMoved: 0,
		imapMoved: 0,
		imapRemoved: 0,
		threadsRecounted: 0,
	};
	for (const [index, group] of toProcess.entries()) {
		try {
			await mergeGroup(group.userId, group.key, totals);
		} catch (error) {
			console.error(`Failed to merge group ${group.userId}/${group.key}:`, error);
		}
		if ((index + 1) % 100 === 0) console.log(`  ${index + 1}/${toProcess.length} groups`, totals);
	}

	console.log(apply ? "Merged:" : "Would merge:", totals);
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
