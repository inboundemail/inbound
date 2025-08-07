import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { markEmailAsRead, getEmailsList, getEmailDetailsFromParsed, getUnifiedEmailLogs } from '@/app/actions/primary'
import type { EmailLogsOptions, EmailLogsResponse } from '../types'

// Export the v2 hooks as primary exports
export {
  useDomainsListV2Query,
  useDomainDetailsV2Query,
  useAddEmailAddressV2Mutation,
  useUpdateEmailEndpointV2Mutation
} from '@/features/domains/hooks/useDomainV2Hooks'

export { useEmailQuery } from './useEmailQuery'
export { useMarkEmailAsReadMutation } from './useMarkEmailAsReadMutation'

// Export email address v2 hooks
export { useEmailAddressesV2Query, useEmailAddressV2Query } from './useEmailAddressesV2Hooks'

export {
  useMailV2Query,
  useMailDetailsV2Query,
  useOutboundEmailDetailsV2Query,
  useMarkEmailAsReadV2Mutation,
  useUserEmailLogsV2Query,
  useReplyToEmailV2Mutation,
  useUpdateEmailMutation,
  useBulkUpdateEmailsMutation,
  useEmailThreadV2Query,
  useEmailThreadCountsV2Query
} from './useMailV2Hooks'

// Legacy email logs hook (inbound only)
export { useUserEmailLogsQuery } from './useUserEmailLogsQuery'

// New unified email logs hook (inbound + outbound)
export function useUnifiedEmailLogsQuery(options: EmailLogsOptions = {}) {
  return useQuery({
    queryKey: ['unified-email-logs', options],
    queryFn: async () => {
      const result = await getUnifiedEmailLogs(options)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data as EmailLogsResponse
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })
}

// Query keys
export const emailKeys = {
  all: ['emails'] as const,
  lists: () => [...emailKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...emailKeys.lists(), filters] as const,
  details: () => [...emailKeys.all, 'detail'] as const,
  detail: (id: string) => [...emailKeys.details(), id] as const,
}

// Infinite unified logs (client-side pagination)
export function useInfiniteUnifiedEmailLogsQuery(options: Omit<EmailLogsOptions, 'offset'> = {}) {
  return useInfiniteQuery<EmailLogsResponse>({
    queryKey: ['unified-email-logs-infinite', options],
    queryFn: async ({ pageParam }) => {
      const result = await getUnifiedEmailLogs({
        ...options,
        limit: options.limit ?? 50,
        offset: typeof pageParam === 'number' ? pageParam : 0,
      })
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data as EmailLogsResponse
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages) => {
      if (lastPage.pagination.hasMore) {
        return (lastPage.pagination.offset ?? 0) + (lastPage.pagination.limit ?? 50)
      }
      return undefined
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })
}

// Legacy hook for listing emails (kept for backward compatibility)
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

// Legacy hook for getting email details (kept for backward compatibility)
export function useEmailDetailsQuery(emailId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.detail(emailId),
    queryFn: () => getEmailDetailsFromParsed(emailId),
    enabled: enabled && !!emailId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
} 