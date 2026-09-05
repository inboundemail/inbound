"use client";

import { useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	useEndpointsInfiniteQuery,
	flattenEndpointPages,
} from "@/features/endpoints/hooks/useEndpointsInfiniteQuery";
import { useRetryDeliveryMutation } from "@/features/emails/hooks/useRetryDeliveryMutation";
import { getDeliveryDestination } from "@/lib/email-management/delivery-diagnostics";
import type { RecoveryDelivery } from "@/lib/email-management/delivery-diagnostics";

interface ResendEmailDialogProps {
	emailId: string;
	deliveries: RecoveryDelivery[];
	disabledReason?: string | null;
}

export function ResendEmailDialog(props: ResendEmailDialogProps) {
	const [open, setOpen] = useState(false);
	const busy =
		useIsMutating({ mutationKey: ["delivery-recovery", props.emailId] }) > 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!busy) setOpen(value);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="primary" disabled={!!props.disabledReason || busy}>
					Send to endpoint
				</Button>
			</DialogTrigger>
			{open && <ResendConfirmation {...props} onClose={() => setOpen(false)} />}
		</Dialog>
	);
}

function ResendConfirmation({
	emailId,
	deliveries,
	disabledReason,
	onClose,
}: ResendEmailDialogProps & { onClose: () => void }) {
	const [selectedEndpointId, setSelectedEndpointId] = useState("");
	const [confirmed, setConfirmed] = useState(false);
	const submitting = useRef(false);
	const mutation = useRetryDeliveryMutation(emailId);
	const busy =
		useIsMutating({ mutationKey: ["delivery-recovery", emailId] }) > 0;
	const query = useEndpointsInfiniteQuery({ active: true, limit: 50 });
	const endpoints = flattenEndpointPages(query.data?.pages).filter(
		(endpoint) => endpoint.isActive,
	);
	const selectedEndpoint = endpoints.find(
		(endpoint) => endpoint.id === selectedEndpointId,
	);
	const destination = selectedEndpoint
		? getDeliveryDestination(
				selectedEndpoint.type,
				selectedEndpoint.type === "email_group"
					? { emails: selectedEndpoint.groupEmails }
					: selectedEndpoint.config,
			)
		: null;
	const priorDeliveries = deliveries.filter(
		(delivery) => delivery.endpoint.id === selectedEndpointId,
	);
	const processing = priorDeliveries.some(
		(delivery) => delivery.status === "processing",
	);
	const alreadyDelivered = priorDeliveries.some(
		(delivery) => delivery.status === "success",
	);
	const blockedReason =
		disabledReason ||
		(processing
			? "This endpoint has a delivery in progress. Refresh its status before another attempt, even if it appears stalled."
			: selectedEndpoint && !destination
				? "This endpoint has no valid destination. Correct its settings before sending."
				: null);

	const handleSend = async () => {
		if (
			submitting.current ||
			busy ||
			blockedReason ||
			!selectedEndpoint ||
			!confirmed ||
			mutation.isSuccess
		)
			return;
		submitting.current = true;
		try {
			const result = await mutation.mutateAsync({
				emailId,
				endpointId: selectedEndpoint.id,
			});
			toast.success(result.message);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Delivery failed");
		} finally {
			submitting.current = false;
			setConfirmed(false);
		}
	};

	return (
		<DialogContent className="max-h-[90dvh] overflow-y-auto [font-family:'Helvetica_Neue',sans-serif]">
			<DialogHeader>
				<DialogTitle>Send to endpoint</DialogTitle>
				<DialogDescription>
					Choose the destination for this email. Sending may create a duplicate,
					including after a failed or timed-out attempt.
				</DialogDescription>
			</DialogHeader>
			<div className="space-y-4 text-sm">
				<div className="space-y-2">
					<label
						htmlFor={`recovery-endpoint-${emailId}`}
						className="font-medium"
					>
						Endpoint
					</label>
					<select
						id={`recovery-endpoint-${emailId}`}
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm"
						value={selectedEndpointId}
						disabled={busy || query.isLoading || mutation.isSuccess}
						onChange={(event) => {
							setSelectedEndpointId(event.target.value);
							setConfirmed(false);
							mutation.reset();
						}}
					>
						<option value="">
							{query.isLoading ? "Loading endpoints…" : "Choose an endpoint"}
						</option>
						{endpoints.map((endpoint) => (
							<option key={endpoint.id} value={endpoint.id}>
								{endpoint.name} · {endpoint.type.replaceAll("_", " ")}
							</option>
						))}
					</select>
					{query.hasNextPage && (
						<Button
							variant="outline"
							disabled={query.isFetchingNextPage || busy}
							onClick={() => query.fetchNextPage()}
						>
							{query.isFetchingNextPage ? "Loading…" : "Load more endpoints"}
						</Button>
					)}
					{query.error && (
						<div role="alert" className="space-y-2">
							<p className="text-destructive">
								Could not load endpoints. {query.error.message}
							</p>
							<Button
								variant="outline"
								onClick={() => query.refetch()}
								disabled={query.isFetching}
							>
								Try again
							</Button>
						</div>
					)}
					{!query.isLoading && !query.error && endpoints.length === 0 && (
						<p>
							No active endpoints.{" "}
							<Link href="/endpoints" className="underline underline-offset-4">
								Create or enable an endpoint
							</Link>{" "}
							first.
						</p>
					)}
				</div>
				{selectedEndpoint && (
					<div className="space-y-2">
						<p className="font-medium">Current destination</p>
						<p className="break-all [font-family:'Berkeley_Mono',monospace]">
							{destination || "Not configured"}
						</p>
						<Link
							href={`/endpoints/${selectedEndpoint.id}`}
							className="inline-block py-2 underline underline-offset-4"
						>
							Endpoint settings
						</Link>
						{alreadyDelivered && (
							<p>
								This email was already delivered to this endpoint. Sending again
								will create another delivery attempt.
							</p>
						)}
					</div>
				)}
				{blockedReason && (
					<p role="status" className="text-muted-foreground">
						{blockedReason}
					</p>
				)}
				{selectedEndpoint && !blockedReason && !mutation.isSuccess && (
					<label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
						<input
							type="checkbox"
							className="mt-1"
							checked={confirmed}
							disabled={busy}
							onChange={(event) => setConfirmed(event.target.checked)}
						/>
						<span>
							I confirm this destination and understand the receiver may receive
							a duplicate.
						</span>
					</label>
				)}
				{mutation.error && (
					<p role="alert" className="text-destructive">
						{mutation.error.message}
					</p>
				)}
				{mutation.isSuccess && <p role="status">{mutation.data.message}</p>}
			</div>
			<DialogFooter>
				<Button variant="outline" disabled={busy} onClick={onClose}>
					{mutation.isSuccess ? "Done" : "Cancel"}
				</Button>
				{!mutation.isSuccess && (
					<Button
						onClick={handleSend}
						disabled={
							!selectedEndpoint || !confirmed || busy || !!blockedReason
						}
					>
						{mutation.isPending ? "Sending…" : "Confirm send"}
					</Button>
				)}
			</DialogFooter>
		</DialogContent>
	);
}
