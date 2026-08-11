import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, getEdenErrorMessage } from "@/lib/api/client";

// Types
export interface ScheduledEmailItem {
	id: string;
	from: string;
	to: string[];
	subject: string;
	scheduled_at: string;
	status: string;
	timezone: string;
	created_at: string;
	attempts: number;
	last_error?: string;
	html?: string;
	text?: string;
}

export interface GetScheduledEmailsResponse {
	data: ScheduledEmailItem[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
}

export interface CancelScheduledEmailResponse {
	success: boolean;
	message: string;
	id: string;
}

// Query keys
export const scheduledEmailsKeys = {
	all: ["scheduled-emails"] as const,
	lists: () => [...scheduledEmailsKeys.all, "list"] as const,
	list: (params?: { limit?: number; offset?: number; status?: string }) =>
		[...scheduledEmailsKeys.lists(), params] as const,
	details: () => [...scheduledEmailsKeys.all, "detail"] as const,
	detail: (id: string) => [...scheduledEmailsKeys.details(), id] as const,
};

// Hook for listing scheduled emails - uses Elysia e2 API via Eden
export function useScheduledEmailsQuery(params?: {
	limit?: number;
	offset?: number;
	status?: string;
}) {
	return useQuery<GetScheduledEmailsResponse>({
		queryKey: scheduledEmailsKeys.list(params),
		queryFn: async () => {
			// Use the e2 emails list endpoint with type=scheduled
			const { data, error } = await client.api.e2.emails.get({
				query: {
					type: "scheduled",
					limit: params?.limit?.toString(),
					offset: params?.offset?.toString(),
					status: params?.status as
						| "all"
						| "delivered"
						| "pending"
						| "failed"
						| "bounced"
						| "scheduled"
						| "cancelled"
						| "unread"
						| "read"
						| "archived"
						| undefined,
				},
			});

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to fetch scheduled emails"),
				);
			}

			// Transform response to match expected format
			return {
				data:
					data?.data?.map((email) => ({
						id: email.id,
						from: email.from,
						to: email.to,
						subject: email.subject,
						scheduled_at: email.scheduled_at || "",
						status: email.status,
						timezone: "UTC",
						created_at: email.created_at,
						attempts: 0,
						last_error: undefined,
						html: undefined,
						text: undefined,
					})) || [],
				pagination: {
					limit: data?.pagination?.limit || 50,
					offset: data?.pagination?.offset || 0,
					total: data?.pagination?.total || 0,
					hasMore: data?.pagination?.has_more || false,
				},
			};
		},
		staleTime: 30 * 1000, // 30 seconds
		gcTime: 5 * 60 * 1000, // 5 minutes
		placeholderData: (previousData) => previousData,
		refetchOnWindowFocus: true, // Refetch when window regains focus
	});
}

// Hook for getting scheduled email details - uses Elysia e2 API via Eden
export function useScheduledEmailQuery(id: string, enabled = true) {
	return useQuery<ScheduledEmailItem>({
		queryKey: scheduledEmailsKeys.detail(id),
		queryFn: async () => {
			const { data, error } = await client.api.e2.emails({ id }).get();

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to fetch scheduled email"),
				);
			}

			if (!data) {
				throw new Error("Scheduled email not found");
			}

			return {
				id: data.id,
				from: data.from,
				to: data.to,
				subject: data.subject,
				scheduled_at: data.scheduled_at || "",
				status: data.status,
				timezone: "UTC",
				created_at: data.created_at,
				attempts: 0,
				last_error: undefined,
				html: data.html || undefined,
				text: data.text || undefined,
			};
		},
		enabled,
		staleTime: 30 * 1000,
		gcTime: 5 * 60 * 1000,
	});
}

// Hook for cancelling a scheduled email - uses Elysia e2 API via Eden
export function useCancelScheduledEmailMutation() {
	const queryClient = useQueryClient();

	return useMutation<CancelScheduledEmailResponse, Error, string>({
		mutationFn: async (id: string) => {
			const { data, error } = await client.api.e2.emails({ id }).delete();

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to cancel scheduled email"),
				);
			}

			return {
				success: data?.success || true,
				message: data?.message || "Scheduled email cancelled",
				id: data?.id || id,
			};
		},
		onSuccess: () => {
			// Invalidate and refetch scheduled emails list
			queryClient.invalidateQueries({ queryKey: scheduledEmailsKeys.lists() });
		},
	});
}
