import { and, desc, eq, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { structuredEmails } from "@/lib/db/schema";
import { getManagedDomain } from "@/lib/domains-and-dns/managed-domain";

export const dynamic = "force-dynamic";

type ParsedAddress = { text?: string; addresses?: Array<{ name?: string | null; address?: string | null }> };

function parseAddress(raw: string | null): ParsedAddress | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as ParsedAddress;
	} catch {
		return null;
	}
}

/** Latest emails received on the signed-in user's inbnd.dev domain, for the /welcome live inbox. */
export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

	const domain = await getManagedDomain(session.user.id);
	if (!domain) return Response.json({ domain: null, emails: [] });

	const rows = await db
		.select({
			id: structuredEmails.id,
			fromData: structuredEmails.fromData,
			recipient: structuredEmails.recipient,
			subject: structuredEmails.subject,
			textBody: structuredEmails.textBody,
			attachments: structuredEmails.attachments,
			createdAt: structuredEmails.createdAt,
		})
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.userId, session.user.id),
				ilike(structuredEmails.recipient, `%@${domain.domain}`),
			),
		)
		.orderBy(desc(structuredEmails.createdAt))
		.limit(5);

	const emails = rows.map((row) => {
		const from = parseAddress(row.fromData);
		let attachmentCount = 0;
		try {
			attachmentCount = (JSON.parse(row.attachments ?? "[]") as unknown[]).length;
		} catch {}
		const sender = from?.addresses?.[0];
		const senderName = sender?.name?.replace(/^"|"$/g, "").trim() || null;
		const senderAddress = sender?.address ?? null;
		return {
			id: row.id,
			from: senderName && senderAddress ? `${senderName} <${senderAddress}>` : (senderAddress ?? from?.text ?? "unknown sender"),
			fromName: senderName,
			fromAddress: senderAddress,
			to: row.recipient,
			subject: row.subject ?? "(no subject)",
			text: (row.textBody ?? "").trim().slice(0, 600),
			attachmentCount,
			receivedAt: row.createdAt?.toISOString() ?? null,
		};
	});

	return Response.json(
		{ domain: domain.domain, emails },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
