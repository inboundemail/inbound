import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { markEmailAsRead, getEmailsList, getEmailDetailsFromParsed } from '@/app/actions/primary'

// Query keys
export const emailKeys = {
  all: ['emails'] as const,
  lists: () => [...emailKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...emailKeys.lists(), filters] as const,
  details: () => [...emailKeys.all, 'detail'] as const,
  detail: (id: string) => [...emailKeys.details(), id] as const,
}

// Hook for listing emails
export function useEmailsListQuery(options?: {
  limit?: number
  offset?: number
  searchQuery?: string
  statusFilter?: string
  domainFilter?: string
}) {
  return useQuery({
    queryKey: emailKeys.list(options || {}),
    queryFn: () => getEmailsList(options),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook for getting email details
export function useEmailDetailsQuery(emailId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.detail(emailId),
    queryFn: () => getEmailDetailsFromParsed(emailId),
    enabled: enabled && !!emailId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Hook for marking email as read
export function useMarkEmailAsReadMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markEmailAsRead,
    onSuccess: (data, emailId) => {
      // Invalidate and refetch email lists
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() })
      
      // Update the specific email detail cache
      queryClient.setQueryData(emailKeys.detail(emailId), (oldData: any) => {
        if (oldData?.success) {
          return {
            ...oldData,
            data: {
              ...oldData.data,
              isRead: true,
              readAt: new Date().toISOString()
            }
          }
        }
        return oldData
      })
    },
    onError: (error) => {
      console.error('Failed to mark email as read:', error)
    }
  })
} 