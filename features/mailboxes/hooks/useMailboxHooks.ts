import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
	CreateMailboxInput,
	CreateMailboxResponse,
	MailboxesResponse,
	MailboxPasswordResponse,
	UpdateMailboxInput,
	UpdateMailboxResponse,
} from "@/features/mailboxes/types";

export const mailboxKeys = {
	all: ["mailboxes"] as const,
};

function getErrorMessage(payload: unknown, fallback: string) {
	if (!payload || typeof payload !== "object") return fallback;

	const response = payload as Record<string, unknown>;
	if (typeof response.message === "string") return response.message;
	if (typeof response.error === "string") return response.error;
	if (response.error && typeof response.error === "object") {
		const error = response.error as Record<string, unknown>;
		if (typeof error.message === "string") return error.message;
	}

	return fallback;
}

async function mailboxRequest<T>(
	path: string,
	options?: RequestInit,
	fallback = "Mailbox request failed",
): Promise<T> {
	const headers = new Headers(options?.headers);
	headers.set("Content-Type", "application/json");
	const response = await fetch(`/api/e2/mailboxes${path}`, {
		...options,
		credentials: "include",
		headers,
	});
	const payload: unknown = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(getErrorMessage(payload, fallback));
	}

	return payload as T;
}

export function useMailboxesQuery() {
	return useQuery({
		queryKey: mailboxKeys.all,
		queryFn: () =>
			mailboxRequest<MailboxesResponse>(
				"?limit=100&offset=0",
				undefined,
				"Failed to load mailboxes",
			),
		staleTime: 30 * 1000,
	});
}

export function useCreateMailboxMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateMailboxInput) =>
			mailboxRequest<CreateMailboxResponse>(
				"",
				{ method: "POST", body: JSON.stringify(input) },
				"Failed to create mailbox",
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: mailboxKeys.all }),
	});
}

export function useUpdateMailboxMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, input }: { id: string; input: UpdateMailboxInput }) =>
			mailboxRequest<UpdateMailboxResponse>(
				`/${id}`,
				{ method: "PUT", body: JSON.stringify(input) },
				"Failed to update mailbox",
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: mailboxKeys.all }),
	});
}

export function useDeleteMailboxMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			mailboxRequest<{ success: true }>(
				`/${id}`,
				{ method: "DELETE" },
				"Failed to delete mailbox",
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: mailboxKeys.all }),
	});
}

export function useRotateMailboxPasswordMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			mailboxRequest<MailboxPasswordResponse>(
				`/${id}/rotate-password`,
				{ method: "POST" },
				"Failed to rotate mailbox password",
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: mailboxKeys.all }),
	});
}
