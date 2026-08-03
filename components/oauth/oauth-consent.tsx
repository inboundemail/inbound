"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";

import InboundIcon from "@/components/icons/inbound";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth/auth-client";

export function OAuthConsent({
	clientName,
	scopes,
}: {
	clientName: string;
	scopes: string[];
}) {
	const [pendingAction, setPendingAction] = useState<"allow" | "deny" | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	async function decide(accept: boolean) {
		setPendingAction(accept ? "allow" : "deny");
		setError(null);
		const result = await authClient.oauth2.consent({
			accept,
			scope: scopes.join(" "),
		});
		if (result.error || !result.data?.url) {
			setError(
				result.error?.message ?? "Could not complete the sign-in request.",
			);
			setPendingAction(null);
			return;
		}
		window.location.assign(result.data.url);
	}

	return (
		<main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-12">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(129,97,255,0.14),transparent_38%)]" />
			<div className="relative w-full max-w-md">
				<div className="mb-6 flex items-center justify-center gap-3">
					<InboundIcon width={34} height={34} />
					<span className="font-outfit text-xl font-semibold text-foreground">
						Inbound
					</span>
				</div>

				<Card>
					<CardHeader className="items-center text-center">
						<div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted text-primary">
							<KeyRound />
						</div>
						<CardTitle className="font-outfit text-2xl">
							Allow {clientName}?
						</CardTitle>
						<CardDescription className="leading-6">
							The application will receive your Inbound identity and the domain
							access you selected.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="rounded-lg bg-muted p-4 text-sm leading-6 text-muted-foreground">
							You can revoke the resulting session without sharing your Inbound
							password.
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<div className="grid grid-cols-2 gap-3">
							<Button
								variant="secondary"
								disabled={pendingAction !== null}
								onClick={() => void decide(false)}
							>
								{pendingAction === "deny" && (
									<Loader2 className="animate-spin" />
								)}
								Deny
							</Button>
							<Button
								disabled={pendingAction !== null}
								onClick={() => void decide(true)}
							>
								{pendingAction === "allow" && (
									<Loader2 className="animate-spin" />
								)}
								Continue
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
