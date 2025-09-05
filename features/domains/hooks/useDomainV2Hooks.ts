import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { track } from '@vercel/analytics'
import type { 
    GetDomainsResponse,
    GetDomainsRequest,
    DomainWithStats
} from '@/app/api/v2/domains/route'
import type { 
    GetDomainByIdResponse,
    PutDomainByIdRequest
} from '@/app/api/v2/domains/[id]/route'
import type {
    PostEmailAddressesRequest,
    PostEmailAddressesResponse
} from '@/app/api/v2/email-addresses/route'
import type {
    PutEmailAddressByIdRequest,
    PutEmailAddressByIdResponse,
    DeleteEmailAddressByIdResponse
} from '@/app/api/v2/email-addresses/[id]/route'

// Query keys for v2 domain API
export const domainV2Keys = {
    all: ['v2', 'domains'] as const,
    list: (params?: GetDomainsRequest) => [...domainV2Keys.all, 'list', params] as const,
    detail: (domainId: string) => [...domainV2Keys.all, domainId] as const,
    verification: (domainId: string) => [...domainV2Keys.all, domainId, 'verification'] as const,
    emailAddresses: (domainId: string) => [...domainV2Keys.all, domainId, 'email-addresses'] as const,
}

// Hook for domains list (replacement for useDomainStatsQuery)
export const useDomainsListV2Query = (params?: GetDomainsRequest) => {
    return useQuery<GetDomainsResponse>({
        queryKey: domainV2Keys.list(params),
        queryFn: async () => {
            const searchParams = new URLSearchParams()
            if (params?.limit) searchParams.set('limit', params.limit.toString())
            if (params?.offset) searchParams.set('offset', params.offset.toString())
            if (params?.status) searchParams.set('status', params.status)
            if (params?.canReceive) searchParams.set('canReceive', params.canReceive)
            if (params?.check) searchParams.set('check', params.check)

            const response = await fetch(`/api/v2/domains?${searchParams}`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            return response.json()
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 5 * 60 * 1000, // 5 minutes
    })
}

// Hook for domain details query
export const useDomainDetailsV2Query = (domainId: string, options?: { check?: boolean }) => {
    return useQuery<GetDomainByIdResponse>({
        queryKey: options?.check ? [...domainV2Keys.detail(domainId), 'check'] : domainV2Keys.detail(domainId),
        queryFn: async () => {
            const url = options?.check 
                ? `/api/v2/domains/${domainId}?check=true`
                : `/api/v2/domains/${domainId}`
            const response = await fetch(url)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            return response.json()
        },
        enabled: !!domainId,
        staleTime: options?.check ? 30 * 1000 : 2 * 60 * 1000, // 30s for check, 2min for regular
        gcTime: 10 * 60 * 1000, // 10 minutes
    })
}

// Hook for domain verification check (using GET with check=true)
export const useDomainVerificationCheckV2 = (domainId: string) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async () => {
            const response = await fetch(`/api/v2/domains?status=pending&check=true`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to check verification')
            }
            return response.json()
        },
        onSuccess: () => {
            // Invalidate domain details to refresh the data
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(domainId) })
        },
    })
}

// Hook for domain auth verification (PATCH /api/v2/domains/{id}/auth)
export const useDomainAuthVerifyV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (domainId: string) => {
            const response = await fetch(`/api/v2/domains/${domainId}/auth`, {
                method: 'PATCH',
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to verify domain authentication')
            }
            return response.json()
        },
        onSuccess: (_, domainId) => {
            // Invalidate domain details to refresh auth status
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(domainId) })
            // Also invalidate the check query
            queryClient.invalidateQueries({ queryKey: [...domainV2Keys.detail(domainId), 'check'] })
        },
    })
}

// Hook for domain deletion
export const useDeleteDomainV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (domainId: string) => {
            const response = await fetch(`/api/v2/domains/${domainId}`, {
                method: 'DELETE',
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete domain')
            }
            return response.json()
        },
        onMutate: async (domainId: string) => {
            console.log('🗑️ Starting optimistic domain deletion for:', domainId)
            
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: domainV2Keys.all })

            // Snapshot the previous values for rollback
            const previousQueriesData: Array<{ queryKey: any; data: GetDomainsResponse }> = []

            // Get all cached domain list queries and update them
            const queries = queryClient.getQueriesData<GetDomainsResponse>({ queryKey: domainV2Keys.all })
            console.log('📊 Found', queries.length, 'cached domain queries to update')
            
            for (const [queryKey, queryData] of queries) {
                // Only process queries that have the expected GetDomainsResponse structure
                if (queryData && 
                    Array.isArray(queryData.data) && 
                    typeof queryData.meta === 'object' && 
                    queryData.meta !== null) {
                    
                    console.log('✅ Updating query with', queryData.data.length, 'domains, totalCount:', queryData.meta.totalCount)
                    
                    // Store previous data for rollback
                    previousQueriesData.push({ queryKey, data: queryData })

                    // Optimistically update by removing the domain
                    const updatedDomains: GetDomainsResponse = {
                        ...queryData,
                        data: queryData.data.filter(domain => domain.id !== domainId),
                        meta: {
                            ...queryData.meta,
                            totalCount: Math.max((queryData.meta?.totalCount || 0) - 1, 0)
                        }
                    }
                    queryClient.setQueryData(queryKey, updatedDomains)
                    
                    console.log('✅ Updated query - new count:', updatedDomains.data.length, 'totalCount:', updatedDomains.meta.totalCount)
                } else {
                    console.warn('⚠️ Skipping invalid query data:', { 
                        hasData: !!queryData,
                        isDataArray: queryData ? Array.isArray(queryData.data) : false,
                        hasMeta: queryData ? typeof queryData.meta === 'object' && queryData.meta !== null : false
                    })
                }
            }

            console.log('✅ Optimistic update complete - updated', previousQueriesData.length, 'queries')
            
            // Return a context object with the snapshotted values
            return { previousQueriesData }
        },
        onError: (err, domainId, context) => {
            console.error('❌ Domain deletion failed, rolling back optimistic updates:', err.message)
            
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousQueriesData) {
                console.log('🔄 Rolling back', context.previousQueriesData.length, 'queries')
                for (const { queryKey, data } of context.previousQueriesData) {
                    queryClient.setQueryData(queryKey, data)
                }
                console.log('✅ Rollback complete')
            }
        },
        onSuccess: (_, domainId) => {
            // Remove domain from cache and invalidate related queries
            queryClient.removeQueries({ queryKey: domainV2Keys.detail(domainId) })
            queryClient.invalidateQueries({ queryKey: domainV2Keys.all })
            
            // Also invalidate legacy domain stats queries for backward compatibility
            queryClient.invalidateQueries({ queryKey: ['domains'] })
            queryClient.invalidateQueries({ queryKey: ['domainStats'] })
        },
    })
}

// Hook for adding email address
export const useAddEmailAddressV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<PostEmailAddressesResponse, Error, PostEmailAddressesRequest>({
        mutationFn: async (data) => {
            const response = await fetch('/api/v2/email-addresses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to add email address')
            }
            return response.json()
        },
        onSuccess: (data) => {
            // Track email address addition
            track('Email Address Added', {
                address: data.address,
                domainId: data.domainId,
                emailAddressId: data.id
            })
            
            // Invalidate domain details to refresh email addresses
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(data.domainId) })
            queryClient.invalidateQueries({ queryKey: domainV2Keys.emailAddresses(data.domainId) })
        },
    })
}

// Hook for deleting email address
export const useDeleteEmailAddressV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<DeleteEmailAddressByIdResponse, Error, { emailAddressId: string; domainId: string }>({
        mutationFn: async ({ emailAddressId }) => {
            const response = await fetch(`/api/v2/email-addresses/${emailAddressId}`, {
                method: 'DELETE',
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete email address')
            }
            return response.json()
        },
        onSuccess: (_, { domainId }) => {
            // Invalidate domain details to refresh email addresses
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(domainId) })
            queryClient.invalidateQueries({ queryKey: domainV2Keys.emailAddresses(domainId) })
        },
    })
}

// Hook for updating email endpoint/webhook
export const useUpdateEmailEndpointV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<PutEmailAddressByIdResponse, Error, PutEmailAddressByIdRequest & { emailAddressId: string; domainId: string }>({
        mutationFn: async ({ emailAddressId, domainId, ...data }) => {
            console.log('🚀 Sending update request:', {
                url: `/api/v2/email-addresses/${emailAddressId}`,
                body: data
            })
            
            const response = await fetch(`/api/v2/email-addresses/${emailAddressId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to update endpoint')
            }
            const result = await response.json()
            console.log('📥 Update response:', result)
            return result
        },
        onSuccess: (_, { domainId }) => {
            // Invalidate domain details to refresh email addresses
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(domainId) })
            queryClient.invalidateQueries({ queryKey: domainV2Keys.emailAddresses(domainId) })
        },
    })
}

// Hook for updating domain catch-all settings
export const useUpdateDomainCatchAllV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<any, Error, PutDomainByIdRequest & { domainId: string }>({
        mutationFn: async ({ domainId, ...data }) => {
            const response = await fetch(`/api/v2/domains/${domainId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to update catch-all settings')
            }
            return response.json()
        },
        onSuccess: (_, { domainId, isCatchAllEnabled, catchAllEndpointId }) => {
            // Track catch-all toggle
            track(isCatchAllEnabled ? 'Catch All Enabled' : 'Catch All Disabled', {
                domainId: domainId,
                endpointId: catchAllEndpointId || null
            })
            
            // Invalidate domain details to refresh catch-all status
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(domainId) })
        },
    })
}

// Hook for upgrading domain with MAIL FROM configuration
export const useUpgradeDomainMailFromV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<any, Error, { domainId: string }>({
        mutationFn: async ({ domainId }) => {
            const response = await fetch(`/api/v2/domains/${domainId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to upgrade domain with MAIL FROM configuration')
            }
            return response.json()
        },
        onSuccess: (data, { domainId }) => {
            // Track MAIL FROM upgrade
            track('Domain MAIL FROM Upgraded', {
                domainId: domainId,
                mailFromDomain: data.mailFromDomain,
                mailFromDomainStatus: data.mailFromDomainStatus
            })
            
            // Invalidate domain details and list to refresh MAIL FROM status
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(domainId) })
            queryClient.invalidateQueries({ queryKey: domainV2Keys.all })
        },
    })
} 