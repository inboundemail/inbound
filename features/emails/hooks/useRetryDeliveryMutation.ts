"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

export type RetryDeliveryParams = { emailId: string } & (
	| { deliveryId: string; endpointId?: never }
	| { endpointId: string; deliveryId?: never }
);

export function useRetryDeliveryMutation(emailId: string) {
	const queryClient = useQueryClient();
	const router = useRouter();

	return useMutation({
		mutationKey: ["delivery-recovery", emailId],
		mutationFn: async (variables: RetryDeliveryParams) => {
			const response = await fetch(
				`/api/e2/emails/${encodeURIComponent(variables.emailId)}/retry`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(
						variables.deliveryId
							? { delivery_id: variables.deliveryId }
							: { endpoint_id: variables.endpointId },
					),
				},
			);
			const data: unknown = await response.json().catch(() => null);
			const result = data !== null && typeof data === "object" ? data : {};
			const message =
				"message" in result && typeof result.message === "string"
					? result.message
					: "error" in result && typeof result.error === "string"
						? result.error
						: `Delivery request failed (HTTP ${response.status})`;

			if (!response.ok || !("success" in result) || result.success !== true) {
				throw new Error(message);
			}

			return {
				success: true,
				message,
				delivery_id:
					"delivery_id" in result && typeof result.delivery_id === "string"
						? result.delivery_id
						: null,
			};
		},
		onSettled: async (_data, _error, variables) => {
			router.refresh();
			await Promise.all(
				[
					["email", variables.emailId],
					["deliveries", variables.emailId],
					["emails"],
					["v2", "mail"],
					["user-email-logs"],
					["unified-email-logs"],
					["unified-email-logs-infinite"],
					["endpoints"],
				].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
			);
		},
	});
}
