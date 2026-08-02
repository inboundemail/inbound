import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { Suspense } from "react";

import { DomainAccess } from "@/components/oauth/domain-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/auth";
import { INBOUND_DOMAIN_SCOPE } from "@/lib/auth/inbound-oauth";
import { db } from "@/lib/db";
import { emailDomains, oauthClient } from "@/lib/db/schema";

export default function DomainAccessPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<Suspense fallback={<OAuthFlowLoading />}>
			<DomainAccessContent searchParams={searchParams} />
		</Suspense>
	);
}

async function DomainAccessContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const rawClientId = params.client_id;
	const clientId = Array.isArray(rawClientId) ? rawClientId[0] : rawClientId;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user || !clientId) {
		return (
			<OAuthFlowError message="This sign-in request is missing or expired." />
		);
	}

	const [client] = await db
		.select({
			name: oauthClient.name,
			disabled: oauthClient.disabled,
			scopes: oauthClient.scopes,
		})
		.from(oauthClient)
		.where(eq(oauthClient.clientId, clientId))
		.limit(1);
	if (
		!client ||
		client.disabled ||
		!client.scopes?.includes(INBOUND_DOMAIN_SCOPE)
	) {
		return (
			<OAuthFlowError message="This application cannot request domain access." />
		);
	}

	const domains = await db
		.select({ id: emailDomains.id, domain: emailDomains.domain })
		.from(emailDomains)
		.where(eq(emailDomains.userId, session.user.id))
		.orderBy(asc(emailDomains.domain));

	return (
		<DomainAccess
			clientId={clientId}
			clientName={client.name ?? "this application"}
			domains={domains}
		/>
	);
}

function OAuthFlowLoading() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground">
			Loading sign-in request…
		</main>
	);
}

function OAuthFlowError({ message }: { message: string }) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-6">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Sign-in request unavailable</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					{message} Return to the application and start again.
				</CardContent>
			</Card>
		</main>
	);
}
