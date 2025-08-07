import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
    GetEmailAddressesResponse,
    GetEmailAddressesRequest,
    PostEmailAddressesRequest,
    PostEmailAddressesResponse
} from '@/app/api/v2/email-addresses/route'
import type {
    GetEmailAddressByIdResponse,
    PutEmailAddressByIdRequest,
    PutEmailAddressByIdResponse,
    DeleteEmailAddressByIdResponse
} from '@/app/api/v2/email-addresses/[id]/route'

// Query keys for v2 email addresses API
export const emailAddressesV2Keys = {
    all: ['v2', 'email-addresses'] as const,
    lists: () => [...emailAddressesV2Keys.all, 'list'] as const,
    list: (params?: GetEmailAddressesRequest) => [...emailAddressesV2Keys.lists(), params] as const,
    details: () => [...emailAddressesV2Keys.all, 'detail'] as const,
    detail: (emailAddressId: string) => [...emailAddressesV2Keys.details(), emailAddressId] as const,
}

// Hook for listing email addresses
export const useEmailAddressesV2Query = (params?: GetEmailAddressesRequest) => {
    return useQuery<GetEmailAddressesResponse>({
        queryKey: emailAddressesV2Keys.list(params),
        queryFn: async () => {
            const searchParams = new URLSearchParams()
            if (params?.limit) searchParams.set('limit', params.limit.toString())
            if (params?.offset) searchParams.set('offset', params.offset.toString())
            if (params?.domainId) searchParams.set('domainId', params.domainId)
            if (params?.isActive) searchParams.set('isActive', params.isActive)
            if (params?.isReceiptRuleConfigured) searchParams.set('isReceiptRuleConfigured', params.isReceiptRuleConfigured)

            const response = await fetch(`/api/v2/email-addresses?${searchParams}`)
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

// Hook for getting email address details
export const useEmailAddressV2Query = (emailAddressId: string) => {
    return useQuery<GetEmailAddressByIdResponse>({
        queryKey: emailAddressesV2Keys.detail(emailAddressId),
        queryFn: async () => {
            const response = await fetch(`/api/v2/email-addresses/${emailAddressId}`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            return response.json()
        },
        enabled: !!emailAddressId,
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    })
}

// Hook for creating email address
export const useCreateEmailAddressV2Mutation = () => {
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
                throw new Error(error.error || 'Failed to create email address')
            }
            return response.json()
        },
        onSuccess: (data) => {
            // Invalidate email addresses lists
            queryClient.invalidateQueries({ queryKey: emailAddressesV2Keys.lists() })
            // Also invalidate domains queries since this affects domain stats
            queryClient.invalidateQueries({ queryKey: ['v2', 'domains'] })
        },
    })
}

// Hook for updating email address
export const useUpdateEmailAddressV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<PutEmailAddressByIdResponse, Error, PutEmailAddressByIdRequest & { emailAddressId: string }>({
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
                throw new Error(error.error || 'Failed to update email address')
            }
            return response.json()
        },
        onSuccess: (data, { emailAddressId }) => {
            // Invalidate specific email address and lists
            queryClient.invalidateQueries({ queryKey: emailAddressesV2Keys.detail(emailAddressId) })
            queryClient.invalidateQueries({ queryKey: emailAddressesV2Keys.lists() })
            // Also invalidate domains queries since this affects domain stats
            queryClient.invalidateQueries({ queryKey: ['v2', 'domains'] })
        },
    })
}

// Hook for deleting email address
export const useDeleteEmailAddressV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<DeleteEmailAddressByIdResponse, Error, string>({
        mutationFn: async (emailAddressId) => {
            const response = await fetch(`/api/v2/email-addresses/${emailAddressId}`, {
                method: 'DELETE',
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to delete email address')
            }
            return response.json()
        },
        onSuccess: (_, emailAddressId) => {
            // Remove from cache and invalidate lists
            queryClient.removeQueries({ queryKey: emailAddressesV2Keys.detail(emailAddressId) })
            queryClient.invalidateQueries({ queryKey: emailAddressesV2Keys.lists() })
            // Also invalidate domains queries since this affects domain stats
            queryClient.invalidateQueries({ queryKey: ['v2', 'domains'] })
        },
    })
} 