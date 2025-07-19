import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
    GetMailResponse,
    GetMailRequest,
    EmailItem
} from '@/app/api/v2/mail/route'
import type {
    GetMailByIdResponse
} from '@/app/api/v2/mail/[id]/route'

// Query keys for v2 mail API
export const mailV2Keys = {
    all: ['v2', 'mail'] as const,
    lists: () => [...mailV2Keys.all, 'list'] as const,
    list: (params?: GetMailRequest) => [...mailV2Keys.lists(), params] as const,
    details: () => [...mailV2Keys.all, 'detail'] as const,
    detail: (emailId: string) => [...mailV2Keys.details(), emailId] as const,
}

// Hook for listing emails (replacement for old email actions)
export const useMailV2Query = (params?: GetMailRequest) => {
    return useQuery<GetMailResponse>({
        queryKey: mailV2Keys.list(params),
        queryFn: async () => {
            const searchParams = new URLSearchParams()
            if (params?.limit) searchParams.set('limit', params.limit.toString())
            if (params?.offset) searchParams.set('offset', params.offset.toString())
            if (params?.search) searchParams.set('search', params.search)
            if (params?.status) searchParams.set('status', params.status)
            if (params?.domain) searchParams.set('domain', params.domain)
            if (params?.timeRange) searchParams.set('timeRange', params.timeRange)

            const response = await fetch(`/api/v2/mail?${searchParams}`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            return response.json()
        },
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
    })
}

// Hook for getting email details by ID (replacement for old email details actions)
export const useMailDetailsV2Query = (emailId: string) => {
    return useQuery<GetMailByIdResponse>({
        queryKey: mailV2Keys.detail(emailId),
        queryFn: async () => {
            const response = await fetch(`/api/v2/mail/${emailId}`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            return response.json()
        },
        enabled: !!emailId,
        staleTime: 60 * 1000, // 1 minute
        gcTime: 10 * 60 * 1000, // 10 minutes
    })
}

// Hook for marking email as read (if available in v2 API - placeholder)
export const useMarkEmailAsReadV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<any, Error, string>({
        mutationFn: async (emailId) => {
            // Note: This endpoint might not exist in v2 API yet
            // For now, we'll need to use the old action or create a new endpoint
            const response = await fetch(`/api/v2/mail/${emailId}/mark-read`, {
                method: 'POST',
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to mark email as read')
            }
            return response.json()
        },
        onSuccess: (_, emailId) => {
            // Update the specific email in cache
            queryClient.invalidateQueries({ queryKey: mailV2Keys.detail(emailId) })
            // Also invalidate the mail lists to update read status
            queryClient.invalidateQueries({ queryKey: mailV2Keys.lists() })
        },
    })
}

// Helper hook for user email logs (replacement for useUserEmailLogsQuery)
export const useUserEmailLogsV2Query = (options?: GetMailRequest) => {
    // This is essentially the same as useMailV2Query but with specific filtering
    return useMailV2Query({
        ...options,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
    })
}

// Hook for replying to an email
export const useReplyToEmailV2Mutation = () => {
    const queryClient = useQueryClient()

    return useMutation<
        { id: string },
        Error,
        {
            emailId: string
            from: string
            to?: string | string[]
            subject?: string
            text?: string
            html?: string
            include_original?: boolean
        }
    >({
        mutationFn: async ({ emailId, ...replyData }) => {
            const response = await fetch(`/api/v2/emails/${emailId}/reply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(replyData),
            })
            
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to send reply')
            }
            
            return response.json()
        },
        onSuccess: (_, { emailId }) => {
            // Invalidate mail lists to show the sent reply
            queryClient.invalidateQueries({ queryKey: mailV2Keys.lists() })
            // Also invalidate the specific email detail
            queryClient.invalidateQueries({ queryKey: mailV2Keys.detail(emailId) })
        },
    })
} 