"use client";

import { Globe2, Loader2, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

import InboundIcon from "@/components/icons/inbound";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { authClient } from "@/lib/auth/auth-client";
import type { InboundDomainScopeMode } from "@/lib/auth/inbound-oauth";

interface DomainOption {
	id: string;
	domain: string;
}

export function DomainAccess({
	clientId,
	clientName,
	domains,
}: {
	clientId: string;
	clientName: string;
	domains: DomainOption[];
}) {
	const idPrefix = useId();
	const allDomainsId = `${idPrefix}-all`;
	const selectedDomainsId = `${idPrefix}-selected`;
	const [mode, setMode] = useState<InboundDomainScopeMode>("selected");
	const [selectedIds, setSelectedIds] = useState(
		() => new Set(domains.map((domain) => domain.id)),
	);
	const [pendingAction, setPendingAction] = useState<"allow" | "deny" | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	function toggleDomain(domainId: string, checked: boolean) {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(domainId);
			else next.delete(domainId);
			return next;
		});
	}

	async function allow() {
		setPendingAction("allow");
		setError(null);
		const response = await fetch("/api/oauth/domain-grants", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				clientId,
				mode,
				domainIds: mode === "selected" ? [...selectedIds] : [],
			}),
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;
			setError(body?.error ?? "Could not save domain access.");
			setPendingAction(null);
			return;
		}

		const result = await authClient.oauth2.continue({ postLogin: true });
		if (result.error || !result.data?.url) {
			setError(
				result.error?.message ?? "Could not continue the sign-in request.",
			);
			setPendingAction(null);
			return;
		}
		window.location.assign(result.data.url);
	}

	async function deny() {
		setPendingAction("deny");
		setError(null);
		const result = await authClient.oauth2.consent({ accept: false });
		if (result.error || !result.data?.url) {
			setError(result.error?.message ?? "Could not deny access.");
			setPendingAction(null);
			return;
		}
		window.location.assign(result.data.url);
	}

	return (
		<main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-12">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(129,97,255,0.14),transparent_38%)]" />
			<div className="relative w-full max-w-lg">
				<div className="mb-6 flex items-center justify-center gap-3">
					<InboundIcon width={34} height={34} />
					<span className="font-outfit text-xl font-semibold text-foreground">
						Inbound
					</span>
				</div>

				<Card>
					<CardHeader className="items-center text-center">
						<div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted text-primary">
							<ShieldCheck />
						</div>
						<CardTitle className="font-outfit text-2xl">
							Sign in to {clientName}
						</CardTitle>
						<CardDescription className="max-w-md leading-6">
							Choose which Inbound domains this session can access.
						</CardDescription>
					</CardHeader>

					<CardContent className="space-y-5">
						<RadioGroup
							value={mode}
							onValueChange={(value) =>
								setMode(value as InboundDomainScopeMode)
							}
							className="gap-3"
						>
							<label
								htmlFor={allDomainsId}
								className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
							>
								<RadioGroupItem
									id={allDomainsId}
									value="all"
									className="mt-0.5"
								/>
								<span>
									<span className="block text-sm font-medium">All domains</span>
									<span className="mt-1 block text-sm leading-5 text-muted-foreground">
										Includes current domains and domains added later.
									</span>
								</span>
							</label>

							<label
								htmlFor={selectedDomainsId}
								className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
							>
								<RadioGroupItem
									id={selectedDomainsId}
									value="selected"
									className="mt-0.5"
								/>
								<span>
									<span className="block text-sm font-medium">
										Specific domains
									</span>
									<span className="mt-1 block text-sm leading-5 text-muted-foreground">
										Only grants access to the domains selected below.
									</span>
								</span>
							</label>
						</RadioGroup>

						{mode === "selected" && (
							<div className="space-y-2 rounded-lg bg-muted p-4">
								<div className="flex items-center justify-between gap-3 pb-1">
									<span className="text-xs text-muted-foreground">
										{selectedIds.size} of {domains.length} selected
									</span>
									<div className="flex items-center gap-1">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={selectedIds.size === domains.length}
											onClick={() =>
												setSelectedIds(
													new Set(domains.map((domain) => domain.id)),
												)
											}
										>
											Select all
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={selectedIds.size === 0}
											onClick={() => setSelectedIds(new Set())}
										>
											Clear all
										</Button>
									</div>
								</div>
								{domains.map((domain) => {
									const checkboxId = `${idPrefix}-${domain.id}`;
									return (
										<label
											key={domain.id}
											htmlFor={checkboxId}
											className="flex cursor-pointer items-center gap-3 py-1"
										>
											<Checkbox
												id={checkboxId}
												checked={selectedIds.has(domain.id)}
												onCheckedChange={(checked) =>
													toggleDomain(domain.id, checked === true)
												}
											/>
											<Globe2 className="size-4 text-muted-foreground" />
											<span className="text-sm">{domain.domain}</span>
										</label>
									);
								})}
								{selectedIds.size === 0 && (
									<p className="pt-1 text-xs leading-5 text-muted-foreground">
										No domains selected. You can sign in, but this application
										will not have access to any domain.
									</p>
								)}
							</div>
						)}

						{error && <p className="text-sm text-destructive">{error}</p>}

						<div className="grid grid-cols-2 gap-3">
							<Button
								variant="secondary"
								disabled={pendingAction !== null}
								onClick={() => void deny()}
							>
								{pendingAction === "deny" && (
									<Loader2 className="animate-spin" />
								)}
								Deny
							</Button>
							<Button
								disabled={pendingAction !== null}
								onClick={() => void allow()}
							>
								{pendingAction === "allow" && (
									<Loader2 className="animate-spin" />
								)}
								Allow access
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
