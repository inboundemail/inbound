import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
    GetMailResponse,
    GetMailRequest,
    EmailItem
} from '@/app/api/v2/mail/route'
import type {
    GetMailByIdResponse,
    PatchMailRequest,
    PatchMailResponse
} from '@/app/api/v2/mail/[id]/route'
import type {
    GetEmailByIdResponse
} from '@/app/api/v2/emails/[id]/route'
import type {
    PostMailBulkRequest,
    PostMailBulkResponse
} from '@/app/api/v2/mail/bulk/route'

// Query keys for v2 mail API
export const mailV2Keys = {
    all: ['v2', 'mail'] as const,
    lists: () => [...mailV2Keys.all, 'list'] as const,
    list: (params?: GetMailRequest) => [...mailV2Keys.lists(), params] as const,
    details: () => [...mailV2Keys.all, 'detail'] as const,
    detail: (emailId: string) => [...mailV2Keys.details(), emailId] as const,
    outboundEmails: () => ['v2', 'emails'] as const,
    outboundEmail: (emailId: string) => [...mailV2Keys.outboundEmails(), emailId] as const,
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

// Hook for getting inbound email details by ID (replacement for old email details actions)
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

// Hook for getting outbound email details by ID
export const useOutboundEmailDetailsV2Query = (emailId: string) => {
    return useQuery<GetEmailByIdResponse>({
        queryKey: mailV2Keys.outboundEmail(emailId),
        queryFn: async () => {
            const response = await fetch(`/api/v2/emails/${emailId}`)
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

// Hook for updating a single email (archive, mark as read, etc.)
export const useUpdateEmailMutation = () => {
    const queryClient = useQueryClient()
    
    return useMutation<
        PatchMailResponse, 
        Error, 
        { emailId: string; updates: PatchMailRequest },
        { previousEmailLists: [any, any][] }
    >({
        mutationFn: async ({ emailId, updates }) => {
            const response = await fetch(`/api/v2/mail/${emailId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updates),
            })
            
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            
            return response.json()
        },
        onMutate: async ({ emailId, updates }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: mailV2Keys.lists() })

            // Snapshot the previous value
            const previousEmailLists = queryClient.getQueriesData({ queryKey: mailV2Keys.lists() })

            // Optimistically update all email list queries
            queryClient.setQueriesData({ queryKey: mailV2Keys.lists() }, (old: any) => {
                if (!old?.emails) return old

                return {
                    ...old,
                    emails: old.emails.map((email: any) => {
                        if (email.id === emailId) {
                            const updatedEmail = { ...email }
                            
                            if (updates.isRead !== undefined) {
                                updatedEmail.isRead = updates.isRead
                                updatedEmail.readAt = updates.isRead ? new Date().toISOString() : null
                            }
                            
                            if (updates.isArchived !== undefined) {
                                updatedEmail.isArchived = updates.isArchived
                                updatedEmail.archivedAt = updates.isArchived ? new Date().toISOString() : null
                            }
                            
                            return updatedEmail
                        }
                        return email
                    })
                }
            })

            // Return a context object with the snapshotted value
            return { previousEmailLists }
        },
        onError: (err, variables, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousEmailLists) {
                context.previousEmailLists.forEach(([queryKey, data]: [any, any]) => {
                    queryClient.setQueryData(queryKey, data)
                })
            }
        },
        onSettled: () => {
            // Always refetch after error or success to ensure we have the latest data
            queryClient.invalidateQueries({ queryKey: mailV2Keys.lists() })
        },
    })
}

// Hook for bulk updating emails (archive, mark as read, etc.)
export const useBulkUpdateEmailsMutation = () => {
    const queryClient = useQueryClient()
    
    return useMutation<
        PostMailBulkResponse, 
        Error, 
        PostMailBulkRequest,
        { previousEmailLists: [any, any][] }
    >({
        mutationFn: async (bulkRequest) => {
            const response = await fetch('/api/v2/mail/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bulkRequest),
            })
            
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || `HTTP error! status: ${response.status}`)
            }
            
            return response.json()
        },
        onMutate: async ({ emailIds, updates }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: mailV2Keys.lists() })

            // Snapshot the previous value
            const previousEmailLists = queryClient.getQueriesData({ queryKey: mailV2Keys.lists() })

            // Optimistically update all email list queries
            queryClient.setQueriesData({ queryKey: mailV2Keys.lists() }, (old: any) => {
                if (!old?.emails) return old

                return {
                    ...old,
                    emails: old.emails.map((email: any) => {
                        if (emailIds.includes(email.id)) {
                            const updatedEmail = { ...email }
                            
                            if (updates.isRead !== undefined) {
                                updatedEmail.isRead = updates.isRead
                                updatedEmail.readAt = updates.isRead ? new Date().toISOString() : null
                            }
                            
                            if (updates.isArchived !== undefined) {
                                updatedEmail.isArchived = updates.isArchived
                                updatedEmail.archivedAt = updates.isArchived ? new Date().toISOString() : null
                            }
                            
                            return updatedEmail
                        }
                        return email
                    }).filter((email: any) => {
                        // If archiving emails, remove them from the list immediately
                        if (updates.isArchived === true) {
                            return !emailIds.includes(email.id)
                        }
                        return true
                    })
                }
            })

            // Return a context object with the snapshotted value
            return { previousEmailLists }
        },
        onError: (err, variables, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousEmailLists) {
                context.previousEmailLists.forEach(([queryKey, data]: [any, any]) => {
                    queryClient.setQueryData(queryKey, data)
                })
            }
        },
        onSettled: () => {
            // Always refetch after error or success to ensure we have the latest data
            queryClient.invalidateQueries({ queryKey: mailV2Keys.lists() })
        },
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