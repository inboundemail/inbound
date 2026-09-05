"use client";

import { useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRetryDeliveryMutation } from "@/features/emails/hooks/useRetryDeliveryMutation";

interface RetryDeliveryButtonProps {
	emailId: string;
	deliveryId: string;
	status: string;
	destination: string | null;
	disabled?: boolean;
}

export function RetryDeliveryButton({
	emailId,
	deliveryId,
	status,
	destination,
	disabled = false,
}: RetryDeliveryButtonProps) {
	const [open, setOpen] = useState(false);
	const submitting = useRef(false);
	const retryMutation = useRetryDeliveryMutation(emailId);
	const busy =
		useIsMutating({ mutationKey: ["delivery-recovery", emailId] }) > 0;
	const unavailable = disabled || (status !== "failed" && status !== "pending");

	const handleRetry = async () => {
		if (submitting.current || busy || unavailable) return;
		submitting.current = true;
		try {
			const result = await retryMutation.mutateAsync({ emailId, deliveryId });
			toast.success(result.message);
			setOpen(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Delivery failed");
		} finally {
			submitting.current = false;
		}
	};

	return (
		<AlertDialog
			open={open}
			onOpenChange={(value) => {
				if (!submitting.current) {
					setOpen(value);
					if (value) retryMutation.reset();
				}
			}}
		>
			<AlertDialogTrigger asChild>
				<Button variant="outline" disabled={busy || unavailable}>
					Retry delivery
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent className="[font-family:'Helvetica_Neue',sans-serif]">
				<AlertDialogHeader>
					<AlertDialogTitle>Retry this delivery?</AlertDialogTitle>
					<AlertDialogDescription>
						This sends the email again using this endpoint’s current settings.
						The receiver may already have processed it, even if the previous
						attempt failed.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-1 text-sm">
					<p className="text-muted-foreground">Current destination</p>
					<p className="break-all [font-family:'Berkeley_Mono',monospace]">
						{destination || "Destination unavailable"}
					</p>
				</div>
				{retryMutation.error && (
					<p role="alert" className="text-sm text-destructive">
						{retryMutation.error.message}
					</p>
				)}
				{unavailable && (
					<p role="status" className="text-sm text-muted-foreground">
						This delivery is no longer available for retry. Close this dialog
						and check its current status.
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={retryMutation.isPending}>
						Cancel
					</AlertDialogCancel>
					<Button onClick={handleRetry} disabled={busy || unavailable}>
						{retryMutation.isPending ? "Sending…" : "Confirm retry"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
