import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { Suspense } from "react";

import { OAuthConsent } from "@/components/oauth/oauth-consent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { oauthClient } from "@/lib/db/schema";

export default function OAuthConsentPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<Suspense fallback={<ConsentLoading />}>
			<ConsentContent searchParams={searchParams} />
		</Suspense>
	);
}

async function ConsentContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const rawClientId = params.client_id;
	const clientId = Array.isArray(rawClientId) ? rawClientId[0] : rawClientId;
	const rawScope = params.scope;
	const scope = Array.isArray(rawScope) ? rawScope[0] : rawScope;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user || !clientId) {
		return (
			<ConsentError message="This sign-in request is missing or expired." />
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
	const requestedScopes = scope?.split(" ").filter(Boolean) ?? [];
	if (
		!client ||
		client.disabled ||
		requestedScopes.some(
			(requestedScope) => !client.scopes?.includes(requestedScope),
		)
	) {
		return (
			<ConsentError message="This application cannot request this access." />
		);
	}

	return (
		<OAuthConsent
			clientName={client.name ?? "this application"}
			scopes={requestedScopes}
		/>
	);
}

function ConsentLoading() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground">
			Loading sign-in request…
		</main>
	);
}

function ConsentError({ message }: { message: string }) {
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
