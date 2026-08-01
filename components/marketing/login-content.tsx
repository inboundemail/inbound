"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import CirclePlay from "@/components/icons/circle-play";
import InboundIcon from "@/components/icons/inbound";
import { LoginForm } from "@/components/login-form";
import { Button } from "@/components/ui/button";

function LoginContentInner() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
	const [errorType, setErrorType] = useState<string | null>(null);
	const [passkeyError, setPasskeyError] = useState<string | null>(null);
	const [magicLinkSent, setMagicLinkSent] = useState(false);
	const [magicLinkEmail, setMagicLinkEmail] = useState("");
	const requestedRedirect = searchParams.get("redirect");
	const callbackURL =
		requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
			? requestedRedirect
			: "/logs";
	const loginURL = `/login?redirect=${encodeURIComponent(callbackURL)}`;

	useEffect(() => {
		const success = searchParams.get("success");
		let error = searchParams.get("error");

		if (!error && success && success.includes("?error=")) {
			const errorMatch = success.match(/\?error=([^&]+)/);
			if (errorMatch) {
				error = errorMatch[1];
			}
		}

		if (error) {
			const errorMessages: Record<string, string> = {
				auth_failed: "Magic link verification failed. Please try again.",
				new_user_signup_disabled:
					"New user signups are currently disabled. If you believe you should have access, please contact support.",
			};
			setErrorType(error);
			setMagicLinkError(
				errorMessages[error] || "An authentication error occurred.",
			);
		}
	}, [searchParams]);

	const getContent = () => {
		if (passkeyError) {
			return (
				<div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
					<div className="flex flex-col items-center gap-6 text-center">
						<div className="w-16 h-16 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/20">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								className="h-8 w-8 text-amber-600 dark:text-amber-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
						</div>
						<div className="flex flex-col gap-2">
							<h1 className="text-2xl font-bold text-foreground">
								Passkey Not Found
							</h1>
							<p className="text-sm text-muted-foreground">{passkeyError}</p>
						</div>
						<div className="flex flex-col gap-3 w-full">
							<Button
								onClick={() => {
									setPasskeyError(null);
								}}
								className="w-full"
							>
								Try Again
							</Button>
							<p className="text-xs text-muted-foreground">
								You can also sign in with Google, GitHub, or a magic link.
							</p>
						</div>
					</div>
				</div>
			);
		}

		if (magicLinkError) {
			const isSignupDisabled = errorType === "new_user_signup_disabled";

			return (
				<div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
					<div className="flex flex-col items-center gap-6 text-center">
						<div
							className={`w-16 h-16 rounded-full flex items-center justify-center ${
								isSignupDisabled
									? "bg-amber-100 dark:bg-amber-900/20"
									: "bg-red-100 dark:bg-red-900/20"
							}`}
						>
							{isSignupDisabled ? (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="h-8 w-8 text-amber-600 dark:text-amber-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
									/>
								</svg>
							) : (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="h-8 w-8 text-red-600 dark:text-red-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<h1 className="text-2xl font-bold text-foreground">
								{isSignupDisabled ? "Signup Disabled" : "Authentication Failed"}
							</h1>
							<p className="text-sm text-muted-foreground">{magicLinkError}</p>
						</div>
						{isSignupDisabled ? (
							<div className="flex flex-col gap-3 w-full">
								<Button
									variant="secondary"
									onClick={() => {
										setMagicLinkError(null);
										setErrorType(null);
										router.replace(loginURL);
									}}
									className="w-full"
								>
									Back to Login
								</Button>
								<a
									href="mailto:support@inbound.so"
									className="text-sm text-primary hover:underline"
								>
									Contact Support
								</a>
							</div>
						) : (
							<Button
								onClick={() => {
									setMagicLinkError(null);
									setErrorType(null);
									router.replace(loginURL);
								}}
								className="w-full"
							>
								Try Again
							</Button>
						)}
					</div>
				</div>
			);
		}

		if (magicLinkSent) {
			return (
				<div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
					<div className="flex flex-col items-center gap-6 text-center">
						<div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								className="h-8 w-8 text-green-600 dark:text-green-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
								/>
							</svg>
						</div>
						<div className="flex flex-col gap-2">
							<h1 className="text-2xl font-bold text-foreground">
								Check your email
							</h1>
							<p className="text-balance text-sm text-muted-foreground">
								We've sent a magic link to{" "}
								<strong className="text-foreground">{magicLinkEmail}</strong>.
								Click the link in your email to sign in.
							</p>
						</div>
						{process.env.NODE_ENV === "development" && (
							<p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
								<strong>Dev mode:</strong> Check your console for the magic link
								URL
							</p>
						)}
						<Button
							variant="secondary"
							className="w-full"
							onClick={() => {
								setMagicLinkSent(false);
								setMagicLinkEmail("");
							}}
						>
							Try a different email
						</Button>
					</div>
				</div>
			);
		}

		return (
			<>
				<Link href="/" className="inline-block">
					<div className="flex flex-col items-center gap-3 mb-8">
						<InboundIcon width={44} height={44} />
						<div className="flex flex-col items-center gap-2 text-center">
							<p className="text-3xl font-semibold font-outfit text-foreground">
								Welcome Back!
							</p>
							<p className="text-sm text-muted-foreground">
								Sign in to continue to your account
							</p>
						</div>
					</div>
				</Link>
				<div className="w-full flex flex-col gap-6">
					<LoginForm
						callbackURL={callbackURL}
						onMagicLinkSent={(email) => {
							setMagicLinkSent(true);
							setMagicLinkEmail(email);
						}}
						onPasskeyError={setPasskeyError}
					/>
					<div className="flex flex-col items-center gap-3 pt-2">
						<a
							href="https://youtu.be/MOi19cSQdRI"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
						>
							<CirclePlay width={14} height={14} />
							Watch setup tutorial video
						</a>
						<p className="text-xs text-muted-foreground text-center">
							By signing in, you agree to our{" "}
							<Link
								href="/terms"
								className="underline underline-offset-2 hover:text-foreground transition-colors"
							>
								Terms of Service
							</Link>{" "}
							and{" "}
							<Link
								href="/privacy"
								className="underline underline-offset-2 hover:text-foreground transition-colors"
							>
								Privacy Policy
							</Link>
						</p>
					</div>
				</div>
			</>
		);
	};

	return (
		<div className="w-full max-w-[350px] z-10 relative flex flex-col items-center">
			{getContent()}
		</div>
	);
}

export function LoginContent() {
	return (
		<Suspense fallback={null}>
			<LoginContentInner />
		</Suspense>
	);
}
