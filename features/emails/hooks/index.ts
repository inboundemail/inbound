import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { markEmailAsRead, getEmailsList, getEmailDetailsFromParsed } from '@/app/actions/primary'

// Export the useEmailQuery hook and types from the dedicated file
export { useEmailQuery, type EmailDetails } from './useEmailQuery'
export { useMarkEmailAsReadMutation } from './useMarkEmailAsReadMutation'

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