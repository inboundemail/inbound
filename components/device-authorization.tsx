"use client";

import { Check, KeyRound, ShieldCheck, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import InboundIcon from "@/components/icons/inbound";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/lib/auth/auth-client";

type State = "entry" | "checking" | "ready" | "approved" | "denied" | "error";

const STORAGE_KEY = "inboundctl-device-code";

export function DeviceAuthorization() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { data: session, isPending: sessionPending } = useSession();
	const [code, setCode] = useState("");
	const [state, setState] = useState<State>("entry");
	const [error, setError] = useState<string | null>(null);
	const codeInputId = useId();

	const verifyCode = useCallback(
		async (value: string, authenticated = Boolean(session)) => {
			const normalized = normalizeCode(value);
			if (!normalized) {
				setError("Enter the code shown by inboundctl.");
				setState("error");
				return;
			}
			setCode(normalized);
			setError(null);
			setState("checking");
			try {
				const response = await fetch(
					`/api/auth/device?user_code=${encodeURIComponent(normalized)}`,
					{ headers: { Accept: "application/json" } },
				);
				const result = (await response.json().catch(() => null)) as {
					status?: string;
					error_description?: string;
					message?: string;
				} | null;
				if (!response.ok || result?.status !== "pending") {
					setError(
						result?.error_description ||
							result?.message ||
							"This code is invalid, expired, or already used.",
					);
					setState("error");
					return;
				}
				window.sessionStorage.setItem(STORAGE_KEY, normalized);
				if (!authenticated) {
					router.push(`/login?redirect=${encodeURIComponent("/device")}`);
					return;
				}
				setState("ready");
			} catch {
				setError("Could not reach Inbound. Try the code again.");
				setState("error");
			}
		},
		[router, session],
	);

	useEffect(() => {
		if (sessionPending || state !== "entry") return;
		const queryCode = searchParams.get("user_code");
		const storedCode = window.sessionStorage.getItem(STORAGE_KEY);
		const initialCode = normalizeCode(queryCode || storedCode || "");
		if (!initialCode) return;
		if (queryCode) {
			window.sessionStorage.setItem(STORAGE_KEY, initialCode);
			router.replace("/device");
		}
		setCode(initialCode);
		void verifyCode(initialCode, Boolean(session));
	}, [router, searchParams, session, sessionPending, state, verifyCode]);

	async function decide(decision: "approve" | "deny") {
		setError(null);
		setState("checking");
		const result =
			decision === "approve"
				? await authClient.device.approve({ userCode: code })
				: await authClient.device.deny({ userCode: code });
		if (result.error || !result.data?.success) {
			setError(
				result.error?.error_description || `Could not ${decision} this device.`,
			);
			setState("error");
			return;
		}
		window.sessionStorage.removeItem(STORAGE_KEY);
		setState(decision === "approve" ? "approved" : "denied");
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

				<Card className="rounded-[21px] bg-card shadow-[0_18px_55px_rgba(20,2,28,0.12)]">
					<CardHeader className="items-center p-7 pb-5 text-center">
						<div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-primary">
							{state === "approved" ? (
								<Check />
							) : state === "denied" ? (
								<X />
							) : (
								<KeyRound />
							)}
						</div>
						<CardTitle className="font-outfit text-2xl">
							{state === "approved"
								? "Device authorized"
								: state === "denied"
									? "Request denied"
									: "Connect inboundctl"}
						</CardTitle>
						<CardDescription className="max-w-sm leading-6">
							{state === "approved"
								? "Return to your terminal. inboundctl will finish signing in automatically."
								: state === "denied"
									? "No access was granted. You can close this window."
									: "Enter the code shown in your terminal, then approve access to your Inbound account."}
						</CardDescription>
					</CardHeader>

					{state !== "approved" && state !== "denied" && (
						<CardContent className="space-y-5 px-7 pb-7">
							{state === "ready" ? (
								<>
									<div className="rounded-xl bg-muted p-4">
										<div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
											<ShieldCheck className="size-4" />
											Approve account access
										</div>
										<p className="text-sm leading-5 text-muted-foreground">
											inboundctl will create a revocable API key for{" "}
											{session?.user.email || "this account"}.
										</p>
										<p className="mt-3 font-mono text-sm font-semibold tracking-[0.16em] text-foreground">
											{formatCode(code)}
										</p>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<Button
											variant="secondary"
											className="min-h-11 transition-transform active:scale-[0.96]"
											onClick={() => void decide("deny")}
										>
											Deny
										</Button>
										<Button
											className="min-h-11 transition-transform active:scale-[0.96]"
											onClick={() => void decide("approve")}
										>
											Approve
										</Button>
									</div>
								</>
							) : (
								<form
									className="space-y-4"
									onSubmit={(event) => {
										event.preventDefault();
										void verifyCode(code);
									}}
								>
									<label className="block space-y-2" htmlFor={codeInputId}>
										<span className="text-sm font-medium text-foreground">
											Device code
										</span>
										<Input
											id={codeInputId}
											value={code}
											onChange={(event) =>
												setCode(event.target.value.toUpperCase())
											}
											placeholder="ABCD-EFGH"
											autoComplete="one-time-code"
											className="h-12 text-center font-mono text-lg tracking-[0.16em]"
											disabled={state === "checking"}
										/>
									</label>
									{error && <p className="text-sm text-destructive">{error}</p>}
									<Button
										type="submit"
										className="min-h-11 w-full transition-transform active:scale-[0.96]"
										disabled={state === "checking" || sessionPending}
									>
										{state === "checking" ? "Checking code..." : "Continue"}
									</Button>
								</form>
							)}
						</CardContent>
					)}
				</Card>
			</div>
		</main>
	);
}

function normalizeCode(value: string): string {
	return value.trim().replaceAll("-", "").toUpperCase();
}

function formatCode(value: string): string {
	return value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value;
}
