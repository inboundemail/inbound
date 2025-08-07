import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { domainsApi, type DomainStatsResponse, type DomainDetails } from '../api/domainsApi'

// Query keys for domains
export const domainKeys = {
  all: ['domains'] as const,
  stats: () => [...domainKeys.all, 'stats'] as const,
  details: () => [...domainKeys.all, 'details'] as const,
  detail: (id: string) => [...domainKeys.details(), id] as const,
}

// Hook for domain statistics
export const useDomainsStatsQuery = () => {
  return useQuery({
    queryKey: domainKeys.stats(),
    queryFn: domainsApi.getDomainStats,
  })
}

// Hook for domain details
export const useDomainDetailsQuery = (domainId: string) => {
  return useQuery({
    queryKey: domainKeys.detail(domainId),
    queryFn: () => domainsApi.getDomainDetails(domainId),
    // Only fetch if domainId is provided
    enabled: !!domainId,
  })
}

// Hook for domain verification mutation
export const useDomainVerifyMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: domainsApi.verifyDomain,
    // Optimistic updates and cache invalidation
    onSuccess: (data, domainId) => {
      // Invalidate and refetch domain stats
      queryClient.invalidateQueries({ queryKey: domainKeys.stats() })
      // Invalidate and refetch specific domain details
      queryClient.invalidateQueries({ queryKey: domainKeys.detail(domainId) })
    },
  })
} 