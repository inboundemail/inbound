"use client";

import { useId, useTransition } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResendEmailDialog } from "@/components/logs/resend-email-dialog";
import { RetryDeliveryButton } from "@/components/logs/retry-delivery-button";
import { diagnoseDelivery } from "@/lib/email-management/delivery-diagnostics";
import type { RecoveryDelivery } from "@/lib/email-management/delivery-diagnostics";

interface DeliveryRecoveryPanelProps {
	emailId: string;
	deliveries: RecoveryDelivery[];
	parseSuccess: boolean | null;
	parseError: string | null;
	guardBlocked: boolean;
	guardReason: string | null;
}

export function DeliveryRecoveryPanel({
	emailId,
	deliveries,
	parseSuccess,
	parseError,
	guardBlocked,
	guardReason,
}: DeliveryRecoveryPanelProps) {
	const headingId = useId();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [refreshing, startRefresh] = useTransition();
	const busy =
		useIsMutating({ mutationKey: ["delivery-recovery", emailId] }) > 0;
	const disabledReason = guardBlocked
		? `Recovery blocked by Guard. ${guardReason || "This email cannot be delivered while blocked."}`
		: parseSuccess !== true
			? `Recovery unavailable: ${parseSuccess === false ? "email parsing failed" : "successful parsing has not been recorded"}.${parseError ? ` ${parseError}` : ""}`
			: null;

	return (
		<section
			aria-labelledby={headingId}
			className="mb-4 border border-border bg-card p-4 sm:p-6 [font-family:'Helvetica_Neue',sans-serif]"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 id={headingId} className="text-base font-semibold">
					Delivery recovery
				</h2>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={refreshing || busy}
						onClick={() =>
							startRefresh(async () => {
								router.refresh();
								await queryClient.invalidateQueries({
									queryKey: ["endpoints"],
								});
							})
						}
					>
						{refreshing ? "Refreshing…" : "Refresh status"}
					</Button>
					<ResendEmailDialog
						emailId={emailId}
						deliveries={deliveries}
						disabledReason={disabledReason}
					/>
				</div>
			</div>
			{disabledReason && (
				<p role="status" className="mt-4 text-sm text-destructive break-words">
					{disabledReason}
				</p>
			)}
			{deliveries.length === 0 ? (
				<div className="mt-4 space-y-1 text-sm">
					<p className="font-medium">No delivery attempt recorded</p>
					{!disabledReason && (
						<p>
							Choose an active endpoint with “Send to endpoint” to deliver this
							email.
						</p>
					)}
				</div>
			) : (
				<div className="mt-4 divide-y divide-border">
					{deliveries.map((delivery) => {
						const diagnosis = diagnoseDelivery(delivery);
						const lastAttempt = delivery.lastAttemptAt
							? new Date(delivery.lastAttemptAt)
							: null;
						const response = delivery.response;
						return (
							<article
								key={delivery.id}
								className="space-y-3 py-4 first:pt-0 last:pb-0"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 space-y-1">
										<h3 className="text-sm font-semibold">
											{delivery.endpoint.name}
										</h3>
										<p className="text-sm break-all [font-family:'Berkeley_Mono',monospace]">
											{delivery.endpoint.destination ||
												"Destination unavailable"}
										</p>
										<p className="text-xs text-muted-foreground">
											Current {delivery.endpoint.type.replaceAll("_", " ")}{" "}
											destination
										</p>
									</div>
									<Badge
										variant={
											delivery.status === "failed"
												? "destructive"
												: delivery.status === "success"
													? "default"
													: "secondary"
										}
									>
										{delivery.status === "success"
											? delivery.endpoint.type === "webhook"
												? "Accepted"
												: "Forwarded"
											: delivery.status === "failed"
												? "Failed"
												: delivery.status === "processing"
													? "Processing"
													: delivery.status === "pending"
														? "Pending"
														: "Unknown"}
									</Badge>
								</div>
								<div className="space-y-1 text-sm">
									<p className="font-medium">{diagnosis.title}</p>
									<p className="max-w-2xl text-muted-foreground">
										{diagnosis.guidance}
									</p>
								</div>
								<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
									<div>
										<dt className="text-muted-foreground">
											{delivery.endpoint.type === "webhook"
												? "HTTP result"
												: "Response code"}
										</dt>
										<dd className="mt-1 tabular-nums">
											{response.statusCode !== null
												? `HTTP ${response.statusCode}`
												: "Not recorded"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Duration</dt>
										<dd className="mt-1 tabular-nums">
											{response.durationMs !== null
												? `${response.durationMs.toLocaleString()} ms`
												: "Not recorded"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Attempts</dt>
										<dd className="mt-1 tabular-nums">
											{delivery.attempts ?? 0}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Last attempt</dt>
										<dd className="mt-1 tabular-nums">
											{lastAttempt && Number.isFinite(lastAttempt.getTime()) ? (
												<time dateTime={delivery.lastAttemptAt || undefined}>
													{new Intl.DateTimeFormat("en", {
														dateStyle: "medium",
														timeStyle: "short",
														timeZone: "UTC",
													}).format(lastAttempt)}{" "}
													UTC
												</time>
											) : (
												"Not recorded"
											)}
										</dd>
									</div>
								</dl>
								{response.error && (
									<p className="break-words text-sm [font-family:'Berkeley_Mono',monospace]">
										{response.error}
									</p>
								)}
								<details className="text-sm">
									<summary className="w-fit cursor-pointer py-2 underline underline-offset-4">
										Inspect latest response
									</summary>
									<div className="space-y-2 py-2">
										<p className="text-muted-foreground">
											Only the latest result and attempt count are stored, not
											an attempt-by-attempt history.
										</p>
										<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all [font-family:'Berkeley_Mono',monospace]">
											{JSON.stringify(response, null, 2)}
										</pre>
										{response.body?.length === 2000 && (
											<p className="text-muted-foreground">
												Response body preview is limited to 2,000 characters.
											</p>
										)}
									</div>
								</details>
								<div className="flex flex-wrap items-center gap-3">
									{delivery.status !== "success" && (
										<RetryDeliveryButton
											emailId={emailId}
											deliveryId={delivery.id}
											status={delivery.status}
											destination={delivery.endpoint.destination}
											disabled={
												!!disabledReason ||
												!diagnosis.canRetry ||
												!delivery.endpoint.destination
											}
										/>
									)}
									{delivery.endpoint.available ? (
										<Button variant="ghost" asChild>
											<Link href={`/endpoints/${delivery.endpoint.id}`}>
												Endpoint settings
											</Link>
										</Button>
									) : (
										<Button variant="ghost" asChild>
											<Link href="/endpoints">Manage endpoints</Link>
										</Button>
									)}
								</div>
							</article>
						);
					})}
				</div>
			)}
		</section>
	);
}
