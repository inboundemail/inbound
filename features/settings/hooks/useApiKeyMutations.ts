import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
	CreateApiKeyData,
	UpdateApiKeyData,
} from "@/features/settings/types";
import { authClient } from "@/lib/auth/auth-client";

export const useCreateApiKeyMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: CreateApiKeyData) => {
			const { data: result, error } = await authClient.apiKey.create(data);
			if (error) {
				throw new Error(error.message);
			}
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
		},
	});
};

export const useUpdateApiKeyMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ keyId, ...updates }: UpdateApiKeyData) => {
			const { error } = await authClient.apiKey.update({ keyId, ...updates });
			if (error) {
				throw new Error(error.message);
			}
		},
		onMutate: async ({ keyId, ...updates }) => {
			await queryClient.cancelQueries({ queryKey: ["apiKeys"] });
			const previousApiKeys = queryClient.getQueryData(["apiKeys"]);
			queryClient.setQueryData(
				["apiKeys"],
				(oldData: Array<{ id: string }> | undefined) => {
					if (!oldData) return oldData;
					return oldData.map((apiKey) =>
						apiKey.id === keyId ? { ...apiKey, ...updates } : apiKey,
					);
				},
			);
			return { previousApiKeys };
		},
		onError: (_err, _variables, context) => {
			if (context?.previousApiKeys) {
				queryClient.setQueryData(["apiKeys"], context.previousApiKeys);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
		},
	});
};

export const useDeleteApiKeyMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (keyId: string) => {
			const { error } = await authClient.apiKey.delete({ keyId });
			if (error) {
				throw new Error(error.message);
			}
		},
		onMutate: async (keyId) => {
			await queryClient.cancelQueries({ queryKey: ["apiKeys"] });
			const previousApiKeys = queryClient.getQueryData(["apiKeys"]);
			queryClient.setQueryData(
				["apiKeys"],
				(oldData: Array<{ id: string }> | undefined) => {
					if (!oldData) return oldData;
					return oldData.filter((apiKey) => apiKey.id !== keyId);
				},
			);
			return { previousApiKeys };
		},
		onError: (_err, _keyId, context) => {
			if (context?.previousApiKeys) {
				queryClient.setQueryData(["apiKeys"], context.previousApiKeys);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
		},
	});
};

export const useRevokeAllApiKeysMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			const { data: apiKeys, error: listError } =
				await authClient.apiKey.list();
			if (listError) {
				throw new Error(listError.message);
			}

			if (!apiKeys?.apiKeys || apiKeys.apiKeys.length === 0) {
				return { count: 0 };
			}

			const enabledKeys = apiKeys.apiKeys.filter((key) => key.enabled);
			if (enabledKeys.length === 0) {
				return { count: 0 };
			}

			const results = await Promise.allSettled(
				enabledKeys.map((key) =>
					authClient.apiKey.update({ keyId: key.id, enabled: false }),
				),
			);

			const successCount = results.filter(
				(r) => r.status === "fulfilled",
			).length;
			const failCount = results.filter((r) => r.status === "rejected").length;

			if (failCount > 0) {
				throw new Error(
					`Failed to revoke ${failCount} of ${enabledKeys.length} API keys`,
				);
			}

			return { count: successCount };
		},
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: ["apiKeys"] });
			const previousApiKeys = queryClient.getQueryData(["apiKeys"]);
			queryClient.setQueryData(
				["apiKeys"],
				(oldData: Array<{ enabled: boolean }> | undefined) => {
					if (!oldData) return oldData;
					return oldData.map((apiKey) => ({ ...apiKey, enabled: false }));
				},
			);
			return { previousApiKeys };
		},
		onError: (_err, _variables, context) => {
			if (context?.previousApiKeys) {
				queryClient.setQueryData(["apiKeys"], context.previousApiKeys);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
		},
	});
};
