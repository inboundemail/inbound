import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { INBOUND_DOMAIN_SCOPE } from "@/lib/auth/inbound-oauth";
import { parseInboundOAuthGrantSelection } from "@/lib/auth/inbound-oauth-grant";
import { db } from "@/lib/db";
import { emailDomains, inboundOAuthGrants, oauthClient } from "@/lib/db/schema";

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const grantSelection = parseInboundOAuthGrantSelection(
		await request.json().catch(() => null),
	);
	if (!grantSelection) {
		return NextResponse.json(
			{ error: "Choose a valid domain access option." },
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
		.where(eq(oauthClient.clientId, grantSelection.clientId))
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

	const requestedDomainIds = grantSelection.domainIds;
	if (grantSelection.mode === "selected") {
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
		mode: grantSelection.mode,
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
