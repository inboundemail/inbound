import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
    detail: (domainId: string) => [...domainV2Keys.all, domainId] as const,
    verification: (domainId: string) => [...domainV2Keys.all, domainId, 'verification'] as const,
    emailAddresses: (domainId: string) => [...domainV2Keys.all, domainId, 'email-addresses'] as const,
}

// Hook for domain details query
export const useDomainDetailsV2Query = (domainId: string) => {
    return useQuery<GetDomainByIdResponse>({
        queryKey: domainV2Keys.detail(domainId),
        queryFn: async () => {
            const response = await fetch(`/api/v2/domains/${domainId}`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            return response.json()
        },
        enabled: !!domainId,
        staleTime: 2 * 60 * 1000, // 2 minutes
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
        onSuccess: (_, domainId) => {
            // Remove domain from cache and invalidate related queries
            queryClient.removeQueries({ queryKey: domainV2Keys.detail(domainId) })
            queryClient.invalidateQueries({ queryKey: domainV2Keys.all })
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
        mutationFn: async ({ emailAddressId, ...data }) => {
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
            return response.json()
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
        onSuccess: (_, { domainId }) => {
            // Invalidate domain details to refresh catch-all status
            queryClient.invalidateQueries({ queryKey: domainV2Keys.detail(domainId) })
        },
    })
} 