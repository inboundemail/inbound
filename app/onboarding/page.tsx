"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { completeOnboarding, skipOnboarding } from "@/app/actions/onboarding";
import ArrowBoldRight from "@/components/icons/arrow-bold-right";
import Check2 from "@/components/icons/check-2";
import CirclePlay from "@/components/icons/circle-play";
import CircleWarning2 from "@/components/icons/circle-warning-2";
import Code2 from "@/components/icons/code-2";
import Copy2 from "@/components/icons/copy-2";
import EnvelopeOpen from "@/components/icons/envelope-open";
import Key2 from "@/components/icons/key-2";
import Loader from "@/components/icons/loader";
import PaperPlane2 from "@/components/icons/paper-plane-2";
import Refresh2 from "@/components/icons/refresh-2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import {
	useApiKeysQuery,
	useCreateApiKeyMutation,
} from "@/features/settings/hooks";
import { client, getEdenErrorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth/auth-client";
import { trackEvent } from "@/lib/utils/visitors";

const QUICKSTART_KEY_NAME = "Inbound quickstart";
const POLL_DURATION_MS = 60_000;

type OnboardingStep = 1 | 2 | 3;
type SendStatus =
	| "idle"
	| "sending"
	| "waiting"
	| "paused"
	| "failed"
	| "received";

interface ReplyData {
	from: string;
	subject: string;
	body: string;
	receivedAt: string;
}

const steps: Array<{
	id: OnboardingStep;
	title: string;
	description: string;
}> = [
	{ id: 1, title: "Create a key", description: "Authenticate your app" },
	{ id: 2, title: "Send and reply", description: "Try the email sandbox" },
	{ id: 3, title: "Inspect the event", description: "See what Inbound parsed" },
];

export default function OnboardingPage() {
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const queryClient = useQueryClient();
	const createApiKeyMutation = useCreateApiKeyMutation();
	const { data: apiKeys = [], isLoading: apiKeysLoading } = useApiKeysQuery();
	const demoEmailInputId = useId();

	const [activeStep, setActiveStep] = useState<OnboardingStep>(1);
	const [hasApiKey, setHasApiKey] = useState(false);
	const [apiKeyPlain, setApiKeyPlain] = useState<string | null>(null);
	const [apiKeyCopied, setApiKeyCopied] = useState(false);
	const [codeCopied, setCodeCopied] = useState(false);
	const [eventCopied, setEventCopied] = useState(false);
	const [demoEmail, setDemoEmail] = useState("");
	const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
	const [sendError, setSendError] = useState<string | null>(null);
	const [sentEmailId, setSentEmailId] = useState<string | null>(null);
	const [reply, setReply] = useState<ReplyData | null>(null);
	const [pollDeadline, setPollDeadline] = useState<number | null>(null);
	const [pollTimeLeft, setPollTimeLeft] = useState(0);
	const [isManualChecking, setIsManualChecking] = useState(false);
	const [isDemoHydrating, setIsDemoHydrating] = useState(true);
	const [isCompleting, setIsCompleting] = useState(false);
	const [isSkipping, setIsSkipping] = useState(false);

	const apiKeysInitializedRef = useRef(false);
	const demoInitializedRef = useRef(false);
	const completionMarkedRef = useRef(false);
	const viewTrackedRef = useRef(false);

	const persistCompletion = async (source: string) => {
		if (!session?.user?.id || completionMarkedRef.current) return true;

		completionMarkedRef.current = true;
		const result = await completeOnboarding(session.user.id);
		if (!result.success) {
			completionMarkedRef.current = false;
			return false;
		}

		queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
		trackEvent("Onboarding Completed", { source });
		return true;
	};

	const applyReply = (nextReply: ReplyData, source: string) => {
		setReply(nextReply);
		setSendStatus("received");
		setPollDeadline(null);
		setPollTimeLeft(0);
		setActiveStep(3);
		trackEvent("Onboarding Reply Received", { source });
		void persistCompletion("reply_received");
	};
	const onReplyReceived = useEffectEvent(applyReply);

	useEffect(() => {
		if (!isPending && !session?.user) {
			router.replace("/login");
		}
	}, [isPending, router, session?.user]);

	useEffect(() => {
		if (session?.user?.email && !demoEmail) {
			setDemoEmail(session.user.email);
		}
	}, [demoEmail, session?.user?.email]);

	useEffect(() => {
		if (session?.user?.id && !viewTrackedRef.current) {
			viewTrackedRef.current = true;
			trackEvent("Onboarding Viewed");
		}
	}, [session?.user?.id]);

	useEffect(() => {
		if (apiKeysLoading || apiKeysInitializedRef.current) return;
		apiKeysInitializedRef.current = true;

		const quickstartKeyExists = apiKeys.some(
			(key) => key.name === QUICKSTART_KEY_NAME && key.enabled !== false,
		);
		if (quickstartKeyExists) {
			setHasApiKey(true);
			setActiveStep((current) => (current === 1 ? 2 : current));
		}
	}, [apiKeys, apiKeysLoading]);

	useEffect(() => {
		if (!session?.user?.id || demoInitializedRef.current) return;
		demoInitializedRef.current = true;
		let cancelled = false;

		const hydrateDemo = async () => {
			try {
				const { data, error } =
					await client.api.e2.onboarding["check-reply"].get();
				if (cancelled || error || !data || !data.hasDemoEmail || !data.demo) {
					return;
				}

				setHasApiKey(true);
				setDemoEmail(data.demo.recipientEmail);
				setSentEmailId(data.demo.emailId);
				if (data.hasReply && data.reply) {
					onReplyReceived(data.reply, "resume");
					return;
				}

				setActiveStep(2);
				const deadline =
					new Date(data.demo.sentAt).getTime() + POLL_DURATION_MS;
				if (deadline > Date.now()) {
					setPollDeadline(deadline);
					setPollTimeLeft(Math.ceil((deadline - Date.now()) / 1000));
					setSendStatus("waiting");
				} else {
					setSendStatus("paused");
				}
			} finally {
				if (!cancelled) setIsDemoHydrating(false);
			}
		};

		void hydrateDemo();
		return () => {
			cancelled = true;
		};
	}, [session?.user?.id]);

	useEffect(() => {
		if (sendStatus !== "waiting" || !pollDeadline) return;

		let cancelled = false;
		let checking = false;
		const checkForReply = async () => {
			if (checking || cancelled) return;
			checking = true;
			try {
				const { data, error } =
					await client.api.e2.onboarding["check-reply"].get();
				if (!cancelled && !error && data?.hasReply && data.reply) {
					onReplyReceived(data.reply, "automatic");
				}
			} finally {
				checking = false;
			}
		};

		const updateCountdown = () => {
			const secondsLeft = Math.max(
				0,
				Math.ceil((pollDeadline - Date.now()) / 1000),
			);
			setPollTimeLeft(secondsLeft);
			if (secondsLeft === 0) {
				setSendStatus("paused");
				setPollDeadline(null);
			}
		};

		void checkForReply();
		updateCountdown();
		const pollInterval = window.setInterval(checkForReply, 3000);
		const countdownInterval = window.setInterval(updateCountdown, 1000);

		return () => {
			cancelled = true;
			window.clearInterval(pollInterval);
			window.clearInterval(countdownInterval);
		};
	}, [pollDeadline, sendStatus]);

	const handleCreateApiKey = async () => {
		try {
			const result = await createApiKeyMutation.mutateAsync({
				name: QUICKSTART_KEY_NAME,
				prefix: "quickstart",
			});
			if (!result?.key) throw new Error("The API key was not returned");

			setApiKeyPlain(result.key);
			setHasApiKey(true);
			trackEvent("Onboarding API Key Created");
			toast.success("API key created");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create API key",
			);
		}
	};

	const copyText = async (
		value: string,
		onCopied: (copied: boolean) => void,
		message: string,
	) => {
		try {
			await navigator.clipboard.writeText(value);
			onCopied(true);
			toast.success(message);
			window.setTimeout(() => onCopied(false), 2000);
		} catch {
			toast.error("Could not copy to your clipboard");
		}
	};

	const handleRunDemo = async () => {
		if (!demoEmail || !demoEmail.includes("@")) {
			setSendStatus("failed");
			setSendError("Enter a valid email address.");
			return;
		}

		setSendStatus("sending");
		setSendError(null);
		try {
			const { data, error } = await client.api.e2.onboarding.demo.post({
				to: demoEmail,
			});
			if (error || !data || typeof data.id !== "string") {
				throw new Error(
					getEdenErrorMessage(error, "Failed to send test email"),
				);
			}

			const deadline = Date.now() + POLL_DURATION_MS;
			setSentEmailId(data.id);
			setPollDeadline(deadline);
			setPollTimeLeft(POLL_DURATION_MS / 1000);
			setSendStatus("waiting");
			trackEvent("Onboarding Test Email Sent");
			toast.success("Test email sent");
		} catch (error) {
			setSendStatus("failed");
			setSendError(
				error instanceof Error ? error.message : "Failed to send test email",
			);
		}
	};

	const handleManualCheck = async () => {
		setIsManualChecking(true);
		try {
			const { data, error } =
				await client.api.e2.onboarding["check-reply"].get();
			if (error) throw new Error(getEdenErrorMessage(error));
			if (data?.hasReply && data.reply) {
				applyReply(data.reply, "manual");
				toast.success("Reply received");
			} else {
				toast.info("No reply yet. Check your inbox and try again.");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not check for a reply",
			);
		} finally {
			setIsManualChecking(false);
		}
	};

	const handleComplete = async (source: string) => {
		setIsCompleting(true);
		try {
			const completed = await persistCompletion(source);
			if (!completed) throw new Error("Failed to save onboarding progress");
			router.push("/add?onboarding=true");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to complete onboarding",
			);
			setIsCompleting(false);
		}
	};

	const handleSkip = async () => {
		if (!session?.user?.id) return;
		setIsSkipping(true);
		try {
			const result = await skipOnboarding(session.user.id);
			if (!result.success) throw new Error(result.error);

			queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
			trackEvent("Onboarding Skipped", { step: activeStep });
			router.push("/add?onboarding=true");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to skip onboarding",
			);
			setIsSkipping(false);
		}
	};

	if (isPending || apiKeysLoading || isDemoHydrating) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<Loader className="h-4 w-4 animate-spin" />
					Preparing your quickstart...
				</div>
			</div>
		);
	}

	if (!session?.user) return null;

	const codeSnippet = `import { Inbound } from "inboundemail";

const inbound = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
});

await inbound.emails.send({
  from: "agent@inbnd.dev",
  to: "${demoEmail || "you@example.com"}",
  subject: "Welcome to Inbound",
  text: "Reply to this email to test inbound email.",
});`;

	const eventPreview = reply
		? JSON.stringify(
				{
					from: reply.from,
					subject: reply.subject,
					text: reply.body,
					received_at: reply.receivedAt,
				},
				null,
				2,
			)
		: "";

	return (
		<div className="min-h-screen bg-background text-foreground">
			<header className="border-b border-border bg-card/80 backdrop-blur">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
							<EnvelopeOpen className="h-4 w-4" />
						</div>
						<div>
							<p className="text-sm font-semibold">Inbound quickstart</p>
							<p className="text-xs text-muted-foreground">About 2 minutes</p>
						</div>
					</div>
					{activeStep < 3 && (
						<Button
							variant="ghost"
							onClick={handleSkip}
							disabled={isSkipping || isCompleting}
							className="min-h-10 text-muted-foreground active:scale-[0.96] transition-transform"
						>
							{isSkipping ? "Saving..." : "Skip quickstart"}
						</Button>
					)}
				</div>
			</header>

			<main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 lg:py-16">
				<aside className="hidden lg:block">
					<div className="sticky top-8 space-y-8">
						<nav aria-label="Onboarding progress" className="space-y-5">
							{steps.map((step) => {
								const isComplete = activeStep > step.id;
								const isActive = activeStep === step.id;
								return (
									<div key={step.id} className="flex gap-3">
										<div
											className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
												isComplete
													? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
													: isActive
														? "border-primary bg-primary text-primary-foreground"
														: "border-border bg-card text-muted-foreground"
											}`}
										>
											{isComplete ? <Check2 className="h-3 w-3" /> : step.id}
										</div>
										<div className="pt-0.5">
											<p
												className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}
											>
												{step.title}
											</p>
											<p className="mt-0.5 text-xs leading-5 text-muted-foreground">
												{step.description}
											</p>
										</div>
									</div>
								);
							})}
						</nav>

						<div className="rounded-2xl border border-border bg-card p-4">
							<p className="text-sm font-medium">Prefer to watch?</p>
							<p className="mt-1 text-xs leading-5 text-muted-foreground">
								Follow the setup tutorial in a separate tab.
							</p>
							<a
								href="https://youtu.be/MOi19cSQdRI"
								target="_blank"
								rel="noopener noreferrer"
								className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
							>
								<CirclePlay className="h-4 w-4" />
								Watch tutorial
							</a>
						</div>
					</div>
				</aside>

				<section className="min-w-0">
					<div className="mb-6 lg:hidden">
						<div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
							<span>Step {activeStep} of 3</span>
							<span>{steps[activeStep - 1].title}</span>
						</div>
						<Progress value={(activeStep / 3) * 100} />
					</div>

					<div className="mb-8 max-w-2xl">
						<p className="mb-3 text-sm font-medium text-primary">
							Welcome, {session.user.name || session.user.email?.split("@")[0]}
						</p>
						<h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
							Send and receive your first email
						</h1>
						<p className="mt-3 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
							Create a key, send a sandbox email, then reply to see how Inbound
							parses it. Nothing here affects your production domain.
						</p>
					</div>

					<div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_16px_50px_rgba(0,0,0,0.06)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.2)]">
						{activeStep === 1 && (
							<div className="p-5 sm:p-8">
								<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<Key2 className="h-5 w-5" />
								</div>
								<h2 className="mt-5 text-balance text-2xl font-semibold tracking-tight">
									Create your API key
								</h2>
								<p className="mt-2 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
									Your app uses this key to authenticate SDK and API requests.
								</p>

								{!hasApiKey && (
									<Button
										onClick={handleCreateApiKey}
										disabled={createApiKeyMutation.isPending}
										className="mt-6 min-h-11 active:scale-[0.96] transition-transform"
									>
										{createApiKeyMutation.isPending ? (
											<>
												<Loader className="h-4 w-4 animate-spin" />
												Creating key...
											</>
										) : (
											"Create API key"
										)}
									</Button>
								)}

								{hasApiKey && (
									<div className="mt-6 space-y-4">
										<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
											<div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
												<Check2 className="h-4 w-4" />
												Quickstart key ready
											</div>
											<p className="mt-1 text-sm leading-6 text-muted-foreground">
												{apiKeyPlain
													? "This key is shown once. Save it in your password manager or .env file now."
													: "An existing quickstart key was found. Its secret remains hidden after creation."}
											</p>
										</div>

										{apiKeyPlain && (
											<div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2 pl-3">
												<code className="min-w-0 flex-1 break-all text-sm">
													{apiKeyPlain}
												</code>
												<Button
													variant="secondary"
													size="icon"
													aria-label="Copy API key"
													className="h-11 w-11 shrink-0 active:scale-[0.96] transition-transform"
													onClick={() =>
														void copyText(
															apiKeyPlain,
															setApiKeyCopied,
															"API key copied",
														)
													}
												>
													{apiKeyCopied ? (
														<Check2 className="h-4 w-4" />
													) : (
														<Copy2 className="h-4 w-4" />
													)}
												</Button>
											</div>
										)}

										<Button
											onClick={() => {
												setActiveStep(2);
												trackEvent("Onboarding Step Completed", { step: 1 });
											}}
											className="min-h-11 active:scale-[0.96] transition-transform"
										>
											Continue to sandbox
											<ArrowBoldRight className="h-4 w-4" />
										</Button>
									</div>
								)}
							</div>
						)}

						{activeStep === 2 && (
							<div className="p-5 sm:p-8">
								<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<PaperPlane2 className="h-5 w-5" />
								</div>
								<h2 className="mt-5 text-balance text-2xl font-semibold tracking-tight">
									Send a sandbox email
								</h2>
								<p className="mt-2 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
									We will send this request using your signed-in account. Reply
									from your inbox and Inbound will show the parsed result here.
								</p>

								<form
									className="mt-6 space-y-5"
									onSubmit={(event) => {
										event.preventDefault();
										void handleRunDemo();
									}}
								>
									<div className="space-y-2">
										<label
											htmlFor={demoEmailInputId}
											className="text-sm font-medium"
										>
											Send the test to
										</label>
										<Input
											id={demoEmailInputId}
											type="email"
											required
											value={demoEmail}
											onChange={(event) => setDemoEmail(event.target.value)}
											disabled={
												sendStatus === "sending" || sendStatus === "waiting"
											}
											placeholder="you@example.com"
											className="h-11"
										/>
									</div>

									<div className="overflow-hidden rounded-xl bg-[#17151d] text-[#f4f0fa] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
										<div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
											<div className="flex items-center gap-2 text-xs text-white/60">
												<Code2 className="h-4 w-4" />
												SDK example
											</div>
											<Button
												variant="ghost"
												size="icon"
												aria-label="Copy SDK example"
												className="h-10 w-10 text-white/60 hover:bg-white/10 hover:text-white active:scale-[0.96] transition-transform"
												onClick={() =>
													void copyText(
														codeSnippet,
														setCodeCopied,
														"Code copied",
													)
												}
											>
												{codeCopied ? (
													<Check2 className="h-4 w-4" />
												) : (
													<Copy2 className="h-4 w-4" />
												)}
											</Button>
										</div>
										<pre className="overflow-x-auto p-4 text-xs leading-6 sm:text-sm">
											<code>{codeSnippet}</code>
										</pre>
									</div>

									{(sendStatus === "idle" || sendStatus === "failed") && (
										<Button
											type="submit"
											className="min-h-11 active:scale-[0.96] transition-transform"
										>
											<PaperPlane2 className="h-4 w-4" />
											{sendStatus === "failed"
												? "Try sending again"
												: "Send test email"}
										</Button>
									)}

									{sendStatus === "sending" && (
										<div
											className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm"
											aria-live="polite"
										>
											<Loader className="h-4 w-4 animate-spin text-primary" />
											Sending your test email...
										</div>
									)}

									{sendStatus === "waiting" && (
										<div
											className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
											aria-live="polite"
										>
											<div className="flex items-start gap-3">
												<span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
													<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-50" />
													<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
												</span>
												<div>
													<p className="text-sm font-medium">
														Check your inbox and reply
													</p>
													<p className="mt-1 text-sm leading-6 text-muted-foreground">
														Listening automatically for {pollTimeLeft} more
														seconds. You can leave this page and resume later.
													</p>
													{sentEmailId && (
														<p className="mt-2 font-mono text-xs text-muted-foreground">
															Email ID: {sentEmailId}
														</p>
													)}
												</div>
											</div>
										</div>
									)}

									{sendStatus === "paused" && (
										<div
											className="rounded-xl border border-border bg-muted/30 p-4"
											aria-live="polite"
										>
											<p className="text-sm font-medium">
												Still waiting for your reply
											</p>
											<p className="mt-1 text-sm leading-6 text-muted-foreground">
												Reply to the test email, then check again. You can also
												resend it or continue without waiting.
											</p>
											<div className="mt-4 flex flex-wrap gap-3">
												<Button
													type="button"
													onClick={handleManualCheck}
													disabled={isManualChecking}
													className="min-h-10 active:scale-[0.96] transition-transform"
												>
													{isManualChecking ? (
														<Loader className="h-4 w-4 animate-spin" />
													) : (
														<Refresh2 className="h-4 w-4" />
													)}
													Check for reply
												</Button>
												<Button
													type="submit"
													variant="secondary"
													className="min-h-10 active:scale-[0.96] transition-transform"
												>
													Resend email
												</Button>
												<Button
													type="button"
													variant="ghost"
													disabled={isCompleting}
													onClick={() =>
														void handleComplete("continued_without_reply")
													}
													className="min-h-10 text-muted-foreground active:scale-[0.96] transition-transform"
												>
													Continue without reply
												</Button>
											</div>
										</div>
									)}

									{sendStatus === "failed" && sendError && (
										<div
											className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"
											role="alert"
										>
											<CircleWarning2 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
											<div>
												<p className="font-medium">The email was not sent</p>
												<p className="mt-1 leading-6 text-muted-foreground">
													{sendError}
												</p>
											</div>
										</div>
									)}
								</form>
							</div>
						)}

						{activeStep === 3 && reply && (
							<div className="p-5 sm:p-8">
								<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
									<Check2 className="h-5 w-5" />
								</div>
								<h2 className="mt-5 text-balance text-2xl font-semibold tracking-tight">
									Your reply arrived
								</h2>
								<p className="mt-2 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
									Inbound received the email and parsed its sender, content, and
									metadata. This is the same data your integration can work
									with.
								</p>

								<div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
									<div className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
										<div>
											<p className="font-medium">{reply.subject}</p>
											<p className="mt-1 text-sm text-muted-foreground">
												From {reply.from}
											</p>
										</div>
										<time className="text-xs text-muted-foreground">
											{new Date(reply.receivedAt).toLocaleString()}
										</time>
									</div>
									<p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
										{reply.body ||
											"No plain-text body was included in the reply."}
									</p>
								</div>

								<div className="mt-5 overflow-hidden rounded-xl bg-[#17151d] text-[#f4f0fa] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
									<div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
										<div className="flex items-center gap-2 text-xs text-white/60">
											<EnvelopeOpen className="h-4 w-4" />
											Parsed event preview
										</div>
										<Button
											variant="ghost"
											size="icon"
											aria-label="Copy parsed event"
											className="h-10 w-10 text-white/60 hover:bg-white/10 hover:text-white active:scale-[0.96] transition-transform"
											onClick={() =>
												void copyText(
													eventPreview,
													setEventCopied,
													"Event copied",
												)
											}
										>
											{eventCopied ? (
												<Check2 className="h-4 w-4" />
											) : (
												<Copy2 className="h-4 w-4" />
											)}
										</Button>
									</div>
									<pre className="max-h-72 overflow-auto p-4 text-xs leading-6 sm:text-sm">
										<code>{eventPreview}</code>
									</pre>
								</div>

								<div className="mt-6">
									<Button
										onClick={() => void handleComplete("domain_setup")}
										disabled={isCompleting}
										className="min-h-11 active:scale-[0.96] transition-transform"
									>
										{isCompleting ? (
											<>
												<Loader className="h-4 w-4 animate-spin" />
												Saving progress...
											</>
										) : (
											<>
												Set up your domain
												<ArrowBoldRight className="h-4 w-4" />
											</>
										)}
									</Button>
								</div>
							</div>
						)}
					</div>

					<a
						href="https://youtu.be/MOi19cSQdRI"
						target="_blank"
						rel="noopener noreferrer"
						className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline lg:hidden"
					>
						<CirclePlay className="h-4 w-4" />
						Watch the setup tutorial
					</a>
				</section>
			</main>
			<Toaster />
		</div>
	);
}
