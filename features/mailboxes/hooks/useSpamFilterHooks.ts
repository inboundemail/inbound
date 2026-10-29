import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SpamFilterLevel } from "@/lib/guard/junk-verdict";

export interface SpamFilterSettings {
	level: SpamFilterLevel;
	isDefault: boolean;
	updatedAt: string | null;
}

export const spamFilterKeys = {
	all: ["spam-filter"] as const,
};

async function spamFilterRequest(options?: RequestInit): Promise<SpamFilterSettings> {
	const headers = new Headers(options?.headers);
	headers.set("Content-Type", "application/json");
	const response = await fetch("/api/e2/spam-filter", {
		...options,
		credentials: "include",
		headers,
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const error =
			payload && typeof payload === "object" && "error" in payload
				? String((payload as { error: unknown }).error)
				: "Spam filter request failed";
		throw new Error(error);
	}
	return payload as SpamFilterSettings;
}

export function useSpamFilterQuery() {
	return useQuery({
		queryKey: spamFilterKeys.all,
		queryFn: () => spamFilterRequest(),
		staleTime: 60 * 1000,
	});
}

export function useUpdateSpamFilterMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (level: SpamFilterLevel) =>
			spamFilterRequest({ method: "PUT", body: JSON.stringify({ level }) }),
		onSuccess: (data) => queryClient.setQueryData(spamFilterKeys.all, data),
	});
}
