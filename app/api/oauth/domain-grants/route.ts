import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { INBOUND_DOMAIN_SCOPE } from "@/lib/auth/inbound-oauth";
import { db } from "@/lib/db";
import { emailDomains, inboundOAuthGrants, oauthClient } from "@/lib/db/schema";

const grantSchema = z.discriminatedUnion("mode", [
	z.object({
		mode: z.literal("all"),
		clientId: z.string().min(1).max(255),
		domainIds: z.array(z.string()).max(250).optional(),
	}),
	z.object({
		mode: z.literal("selected"),
		clientId: z.string().min(1).max(255),
		domainIds: z.array(z.string().min(1).max(255)).min(1).max(250),
	}),
]);

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsedBody = grantSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsedBody.success) {
		return NextResponse.json(
			{ error: "Choose all domains or at least one specific domain." },
			{ status: 400 },
		);
	}

	const [client] = await db
		.select({
			clientId: oauthClient.clientId,
			disabled: oauthClient.disabled,
			scopes: oauthClient.scopes,
		})
		.from(oauthClient)
		.where(eq(oauthClient.clientId, parsedBody.data.clientId))
		.limit(1);
	if (
		!client ||
		client.disabled ||
		!client.scopes?.includes(INBOUND_DOMAIN_SCOPE)
	) {
		return NextResponse.json(
			{ error: "OAuth client not found." },
			{ status: 404 },
		);
	}

	const requestedDomainIds =
		parsedBody.data.mode === "selected"
			? [...new Set(parsedBody.data.domainIds)]
			: [];
	if (parsedBody.data.mode === "selected") {
		const ownedDomains = await db
			.select({ id: emailDomains.id })
			.from(emailDomains)
			.where(eq(emailDomains.userId, session.user.id));
		const ownedIds = new Set(ownedDomains.map((domain) => domain.id));
		if (!requestedDomainIds.every((domainId) => ownedIds.has(domainId))) {
			return NextResponse.json(
				{ error: "One or more selected domains are unavailable." },
				{ status: 400 },
			);
		}
	}

	const grantId = nanoid();
	await db.insert(inboundOAuthGrants).values({
		id: grantId,
		userId: session.user.id,
		sessionId: session.session.id,
		clientId: client.clientId,
		mode: parsedBody.data.mode,
		domainIds: requestedDomainIds,
		createdAt: new Date(),
	});

	return NextResponse.json(
		{ grantId },
		{
			status: 201,
			headers: { "Cache-Control": "no-store" },
		},
	);
}
