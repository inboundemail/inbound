import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { markEmailAsRead, getEmailsList, getEmailDetailsFromParsed } from '@/app/actions/primary'

// Export the v2 hooks as primary exports
export {
  useDomainsListV2Query,
  useDomainDetailsV2Query,
  useAddEmailAddressV2Mutation,
  useUpdateEmailEndpointV2Mutation
} from '@/features/domains/hooks/useDomainV2Hooks'

export {
  useEmailAddressesV2Query,
  useEmailAddressV2Query,
  useCreateEmailAddressV2Mutation,
  useUpdateEmailAddressV2Mutation,
  useDeleteEmailAddressV2Mutation
} from './useEmailAddressesV2Hooks'

export {
  useMailV2Query,
  useMailDetailsV2Query,
  useMarkEmailAsReadV2Mutation,
  useUserEmailLogsV2Query,
  useReplyToEmailV2Mutation
} from './useMailV2Hooks'

// Legacy exports from dedicated files (keep for backward compatibility)
export { useEmailQuery } from './useEmailQuery'
export { useMarkEmailAsReadMutation } from './useMarkEmailAsReadMutation'
export { useUserEmailLogsQuery } from './useUserEmailLogsQuery'

// Query keys
export const emailKeys = {
  all: ['emails'] as const,
  lists: () => [...emailKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...emailKeys.lists(), filters] as const,
  details: () => [...emailKeys.all, 'detail'] as const,
  detail: (id: string) => [...emailKeys.details(), id] as const,
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