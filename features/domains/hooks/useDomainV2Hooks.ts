import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	client,
	getEdenErrorMessage,
	safeResponseJson,
} from "@/lib/api/client";
import type {
	DeleteEmailAddressByIdResponse,
	GetDomainsRequest,
	PostEmailAddressesRequest,
	PostEmailAddressesResponse,
	PutDomainByIdRequest,
	PutEmailAddressByIdRequest,
	PutEmailAddressByIdResponse,
} from "@/lib/api-types";

// E2 API Domain type (uses string dates instead of Date objects)
export interface E2DomainWithStats {
	id: string;
	domain: string;
	status: string;
	canReceiveEmails: boolean;
	hasMxRecords: boolean;
	domainProvider: string | null;
	providerConfidence: string | null;
	lastDnsCheck: string | null;
	lastSesCheck: string | null;
	isCatchAllEnabled: boolean;
	catchAllEndpointId: string | null;
	mailFromDomain: string | null;
	mailFromDomainStatus: string | null;
	mailFromDomainVerifiedAt: string | null;
	receiveDmarcEmails: boolean;
	createdAt: string;
	updatedAt: string;
	userId: string;
	stats: {
		totalEmailAddresses: number;
		activeEmailAddresses: number;
		hasCatchAll: boolean;
	};
	catchAllEndpoint?: {
		id: string;
		name: string;
		type: string;
		isActive: boolean;
	} | null;
	verificationCheck?: {
		dnsRecords: Array<{
			type: string;
			name: string;
			value: string;
			isVerified: boolean;
			error?: string;
		}>;
		sesStatus: string;
		isFullyVerified: boolean;
		lastChecked: string;
	};
}

// E2 API List Response type
export interface E2DomainsListResponse {
	data: E2DomainWithStats[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
}

// Extended response with meta for cache/UI compatibility
export interface GetDomainsResponse extends E2DomainsListResponse {
	meta: {
		totalCount: number;
		verifiedCount: number;
		withCatchAllCount: number;
		statusBreakdown: {
			verified: number;
			pending: number;
			failed: number;
		};
	};
}

// Extended domain response type that includes the new inheritance fields from e2 API
// Note: Uses string dates as returned by the e2 API (ISO 8601 format)
export interface DomainDetailsResponse {
	id: string;
	domain: string;
	status: string;
	canReceiveEmails: boolean;
	hasMxRecords: boolean;
	domainProvider: string | null;
	providerConfidence: string | null;
	lastDnsCheck: string | null;
	lastSesCheck: string | null;
	isCatchAllEnabled: boolean;
	catchAllEndpointId: string | null;
	mailFromDomain: string | null;
	mailFromDomainStatus: string | null;
	mailFromDomainVerifiedAt: string | null;
	receiveDmarcEmails?: boolean; // Optional - not returned by e2 API
	createdAt: string;
	updatedAt: string;
	userId: string;
	stats: {
		totalEmailAddresses: number;
		activeEmailAddresses: number;
		hasCatchAll?: boolean; // Optional - different structure in get vs list
		emailsLast24h?: number; // Only in get response
		emailsLast7d?: number;
		emailsLast30d?: number;
	};
	catchAllEndpoint?: {
		id: string;
		name: string;
		type: string;
		isActive: boolean;
	} | null;
	verificationCheck?: {
		dnsRecords: Array<{
			type: string;
			name: string;
			value: string;
			isVerified: boolean;
			error?: string;
		}>;
		sesStatus: string;
		isFullyVerified: boolean;
		lastChecked: string;
		mailFromDomain?: string;
		mailFromStatus?: string;
		mailFromVerified?: boolean;
		dkimStatus?: string;
		dkimVerified?: boolean;
		dkimTokens?: string[];
	};
	authRecommendations?: {
		spf?: { name: string; value: string; description: string };
		dkim?: { name: string; value: string; description: string };
		dmarc?: { name: string; value: string; description: string };
	};
	// E2 API specific fields
	inheritsFromParent?: boolean;
	parentDomain?: string | null;
	// DNS records are always included in e2 response
	dnsRecords?: Array<{
		id: string;
		domainId: string;
		recordType: string;
		name: string;
		value: string;
		isRequired: boolean;
		isVerified: boolean;
		lastChecked: string | null;
		createdAt: string;
	}>;
}

// Query keys for v2 domain API
export const domainV2Keys = {
	all: ["v2", "domains"] as const,
	list: (params?: GetDomainsRequest) =>
		[...domainV2Keys.all, "list", params] as const,
	detail: (domainId: string) => [...domainV2Keys.all, domainId] as const,
	verification: (domainId: string) =>
		[...domainV2Keys.all, domainId, "verification"] as const,
	emailAddresses: (domainId: string) =>
		[...domainV2Keys.all, domainId, "email-addresses"] as const,
};

// Hook for domains list (replacement for useDomainStatsQuery) - uses Elysia e2 API via Eden
export const useDomainsListV2Query = (
	params?: GetDomainsRequest & { fetchAll?: boolean },
) => {
	return useQuery<GetDomainsResponse>({
		queryKey: domainV2Keys.list(params),
		queryFn: async ({ signal }) => {
			const domains: E2DomainWithStats[] = [];
			let offset = params?.offset ?? 0;
			let e2Response: E2DomainsListResponse;
			do {
				const { data, error } = await client.api.e2.domains.get({
					fetch: { signal },
					query: {
						limit: params?.limit,
						offset,
						status: params?.status as
							| "pending"
							| "verified"
							| "failed"
							| undefined,
						canReceive: params?.canReceive as "true" | "false" | undefined,
						check: params?.check as "true" | undefined,
					},
				});

				if (error) {
					throw new Error(getEdenErrorMessage(error, "Failed to fetch domains"));
				}

				e2Response = data as E2DomainsListResponse;
				domains.push(...e2Response.data);
				offset = e2Response.pagination.offset + e2Response.pagination.limit;
			} while (params?.fetchAll && e2Response.pagination.hasMore);

			if (params?.fetchAll) {
				e2Response = {
					...e2Response,
					data: domains,
					pagination: {
						...e2Response.pagination,
						limit: domains.length,
						offset: params.offset ?? 0,
					},
				};
			}

			// Calculate meta statistics from the data
			const verifiedCount = e2Response.data.filter(
				(d) => d.status === "verified",
			).length;
			const withCatchAllCount = e2Response.data.filter(
				(d) => d.stats.hasCatchAll,
			).length;
			const statusBreakdown = {
				verified: e2Response.data.filter((d) => d.status === "verified").length,
				pending: e2Response.data.filter((d) => d.status === "pending").length,
				failed: e2Response.data.filter((d) => d.status === "failed").length,
			};

			// Return with computed meta to match GetDomainsResponse
			return {
				...e2Response,
				meta: {
					totalCount: e2Response.pagination.total,
					verifiedCount,
					withCatchAllCount,
					statusBreakdown,
				},
			};
		},
		staleTime: 2 * 60 * 1000, // 2 minutes
		gcTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Hook for domain details query - uses Elysia e2 API via Eden
export const useDomainDetailsV2Query = (
	domainId: string,
	options?: { check?: boolean },
) => {
	return useQuery<DomainDetailsResponse>({
		queryKey: options?.check
			? [...domainV2Keys.detail(domainId), "check"]
			: domainV2Keys.detail(domainId),
		queryFn: async () => {
			const { data, error } = await client.api.e2
				.domains({ id: domainId })
				.get({
					query: options?.check ? { check: "true" } : undefined,
				});

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to fetch domain details"),
				);
			}

			return data as DomainDetailsResponse;
		},
		enabled: !!domainId,
		staleTime: options?.check ? 30 * 1000 : 2 * 60 * 1000, // 30s for check, 2min for regular
		gcTime: 10 * 60 * 1000, // 10 minutes
	});
};

// Hook for domain verification check (using GET with check=true) - uses Elysia e2 API via Eden
export const useDomainVerificationCheckV2 = (domainId: string) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			const { data, error } = await client.api.e2.domains.get({
				query: { status: "pending", check: "true" },
			});

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to check verification"),
				);
			}

			return data;
		},
		onSuccess: () => {
			// Invalidate domain details to refresh the data
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.detail(domainId),
			});
		},
	});
};

// Hook for domain auth verification - uses Elysia e2 API via Eden
// Auth verification is now done via GET with check=true in the e2 API
export const useDomainAuthVerifyV2Mutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (domainId: string) => {
			// The e2 API uses GET with check=true to verify domain authentication
			const { data, error } = await client.api.e2
				.domains({ id: domainId })
				.get({
					query: { check: "true" },
				});

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to verify domain authentication"),
				);
			}

			return data;
		},
		onSuccess: (_, domainId) => {
			// Invalidate domain details to refresh auth status
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.detail(domainId),
			});
			// Also invalidate the check query
			queryClient.invalidateQueries({
				queryKey: [...domainV2Keys.detail(domainId), "check"],
			});
		},
	});
};

// Hook for domain deletion - uses Elysia e2 API via Eden
export const useDeleteDomainV2Mutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (domainId: string) => {
			const { data, error } = await client.api.e2
				.domains({ id: domainId })
				.delete();

			if (error) {
				throw new Error(getEdenErrorMessage(error, "Failed to delete domain"));
			}

			return data;
		},
		onMutate: async (domainId: string) => {
			console.log("🗑️ Starting optimistic domain deletion for:", domainId);

			// Cancel any outgoing refetches (so they don't overwrite our optimistic update)
			await queryClient.cancelQueries({ queryKey: domainV2Keys.all });

			// Snapshot the previous values for rollback
			const previousQueriesData: Array<{
				queryKey: any;
				data: GetDomainsResponse;
			}> = [];

			// Get all cached domain list queries and update them
			const queries = queryClient.getQueriesData<GetDomainsResponse>({
				queryKey: domainV2Keys.all,
			});
			console.log(
				"📊 Found",
				queries.length,
				"cached domain queries to update",
			);

			for (const [queryKey, queryData] of queries) {
				// Only process queries that have the expected GetDomainsResponse structure
				if (
					queryData &&
					Array.isArray(queryData.data) &&
					typeof queryData.meta === "object" &&
					queryData.meta !== null
				) {
					console.log(
						"✅ Updating query with",
						queryData.data.length,
						"domains, totalCount:",
						queryData.meta.totalCount,
					);

					// Store previous data for rollback
					previousQueriesData.push({ queryKey, data: queryData });

					// Optimistically update by removing the domain
					const updatedDomains: GetDomainsResponse = {
						...queryData,
						data: queryData.data.filter((domain) => domain.id !== domainId),
						meta: {
							...queryData.meta,
							totalCount: Math.max((queryData.meta?.totalCount || 0) - 1, 0),
						},
					};
					queryClient.setQueryData(queryKey, updatedDomains);

					console.log(
						"✅ Updated query - new count:",
						updatedDomains.data.length,
						"totalCount:",
						updatedDomains.meta.totalCount,
					);
				} else {
					console.warn("⚠️ Skipping invalid query data:", {
						hasData: !!queryData,
						isDataArray: queryData ? Array.isArray(queryData.data) : false,
						hasMeta: queryData
							? typeof queryData.meta === "object" && queryData.meta !== null
							: false,
					});
				}
			}

			console.log(
				"✅ Optimistic update complete - updated",
				previousQueriesData.length,
				"queries",
			);

			// Return a context object with the snapshotted values
			return { previousQueriesData };
		},
		onError: (err, domainId, context) => {
			console.error(
				"❌ Domain deletion failed, rolling back optimistic updates:",
				err.message,
			);

			// If the mutation fails, use the context returned from onMutate to roll back
			if (context?.previousQueriesData) {
				console.log(
					"🔄 Rolling back",
					context.previousQueriesData.length,
					"queries",
				);
				for (const { queryKey, data } of context.previousQueriesData) {
					queryClient.setQueryData(queryKey, data);
				}
				console.log("✅ Rollback complete");
			}
		},
		onSuccess: (_, domainId) => {
			// Remove domain from cache and invalidate related queries
			queryClient.removeQueries({ queryKey: domainV2Keys.detail(domainId) });
			queryClient.invalidateQueries({ queryKey: domainV2Keys.all });

			// Also invalidate legacy domain stats queries for backward compatibility
			queryClient.invalidateQueries({ queryKey: ["domains"] });
			queryClient.invalidateQueries({ queryKey: ["domainStats"] });
		},
	});
};

// Hook for adding email address - uses Elysia e2 API via Eden
export const useAddEmailAddressV2Mutation = () => {
	const queryClient = useQueryClient();

	return useMutation<
		PostEmailAddressesResponse,
		Error,
		PostEmailAddressesRequest
	>({
		mutationFn: async (data) => {
			const { data: responseData, error } = await client.api.e2[
				"email-addresses"
			].post({
				address: data.address,
				domainId: data.domainId,
				endpointId: data.endpointId,
				webhookId: data.webhookId,
				isActive: data.isActive,
			});

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to add email address"),
				);
			}

			return responseData as unknown as PostEmailAddressesResponse;
		},
		onSuccess: (data) => {
			// Invalidate domain details to refresh email addresses
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.detail(data.domainId),
			});
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.emailAddresses(data.domainId),
			});
		},
	});
};

// Hook for deleting email address - uses Elysia e2 API via Eden
export const useDeleteEmailAddressV2Mutation = () => {
	const queryClient = useQueryClient();

	return useMutation<
		DeleteEmailAddressByIdResponse,
		Error,
		{ emailAddressId: string; domainId: string }
	>({
		mutationFn: async ({ emailAddressId }) => {
			const { data, error } = await client.api.e2["email-addresses"]({
				id: emailAddressId,
			}).delete();

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to delete email address"),
				);
			}

			return data as DeleteEmailAddressByIdResponse;
		},
		onSuccess: (_, { domainId }) => {
			// Invalidate domain details to refresh email addresses
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.detail(domainId),
			});
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.emailAddresses(domainId),
			});
		},
	});
};

// Hook for updating email endpoint/webhook - uses Elysia e2 API via Eden
export const useUpdateEmailEndpointV2Mutation = () => {
	const queryClient = useQueryClient();

	return useMutation<
		PutEmailAddressByIdResponse,
		Error,
		PutEmailAddressByIdRequest & { emailAddressId: string; domainId: string }
	>({
		mutationFn: async ({ emailAddressId, domainId, ...data }) => {
			console.log("🚀 Sending update request via Eden:", {
				emailAddressId,
				body: data,
			});

			const { data: responseData, error } = await client.api.e2[
				"email-addresses"
			]({ id: emailAddressId }).put({
				endpointId: data.endpointId,
				webhookId: data.webhookId,
				isActive: data.isActive,
			});

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to update endpoint"),
				);
			}

			console.log("📥 Update response:", responseData);
			return responseData as unknown as PutEmailAddressByIdResponse;
		},
		onSuccess: (_, { domainId }) => {
			// Invalidate domain details to refresh email addresses
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.detail(domainId),
			});
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.emailAddresses(domainId),
			});
		},
	});
};

// Hook for updating domain catch-all settings - uses Elysia e2 API via Eden
export const useUpdateDomainCatchAllV2Mutation = () => {
	const queryClient = useQueryClient();

	return useMutation<any, Error, PutDomainByIdRequest & { domainId: string }>({
		mutationFn: async ({ domainId, isCatchAllEnabled, catchAllEndpointId }) => {
			const { data, error } = await client.api.e2
				.domains({ id: domainId })
				.patch({
					isCatchAllEnabled: isCatchAllEnabled ?? false,
					catchAllEndpointId: catchAllEndpointId ?? null,
				});

			if (error) {
				throw new Error(
					getEdenErrorMessage(error, "Failed to update catch-all settings"),
				);
			}

			return data;
		},
		onSuccess: (_, { domainId }) => {
			// Invalidate domain details to refresh catch-all status
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.detail(domainId),
			});
		},
	});
};

// Hook for upgrading domain with MAIL FROM configuration - uses Elysia e2 API via Eden
// MAIL FROM verification is handled by the GET endpoint with check=true parameter
export const useUpgradeDomainMailFromV2Mutation = () => {
	const queryClient = useQueryClient();

	return useMutation<any, Error, { domainId: string }>({
		mutationFn: async ({ domainId }) => {
			// The e2 API GET endpoint with check=true handles MAIL FROM verification
			// It will retry MAIL FROM setup if still pending, failed, or not set
			const { data, error } = await client.api.e2
				.domains({ id: domainId })
				.get({
					query: { check: "true" },
				});

			if (error) {
				throw new Error(
					getEdenErrorMessage(
						error,
						"Failed to upgrade domain with MAIL FROM configuration",
					),
				);
			}

			return data;
		},
		onSuccess: (_, { domainId }) => {
			// Invalidate domain details and list to refresh MAIL FROM status
			queryClient.invalidateQueries({
				queryKey: domainV2Keys.detail(domainId),
			});
			queryClient.invalidateQueries({ queryKey: domainV2Keys.all });
		},
	});
};
