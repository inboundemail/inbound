import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDomainDetails, checkDomainVerification, deleteDomain } from '@/app/actions/domains'
import { 
  addEmailAddress, 
  deleteEmailAddress, 
  updateEmailWebhook, 
  enableDomainCatchAll, 
  disableDomainCatchAll, 
  getDomainCatchAllStatus 
} from '@/app/actions/primary'

// Query keys for domain details
export const domainDetailsKeys = {
  all: ['domainDetails'] as const,
  detail: (domainId: string) => [...domainDetailsKeys.all, domainId] as const,
  catchAll: (domainId: string) => [...domainDetailsKeys.all, domainId, 'catchAll'] as const,
}

// Hook for domain details query
export const useDomainDetailsQuery = (domainId: string, domainName?: string) => {
  return useQuery({
    queryKey: domainDetailsKeys.detail(domainId),
    queryFn: async () => {
      const result = await getDomainDetails(domainName || domainId, domainId, true)
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch domain details')
      }
      return result
    },
    enabled: !!domainId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Hook for catch-all status query
export const useCatchAllStatusQuery = (domainId: string) => {
  return useQuery({
    queryKey: domainDetailsKeys.catchAll(domainId),
    queryFn: async () => {
      const result = await getDomainCatchAllStatus(domainId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch catch-all status')
      }
      return result.data
    },
    enabled: !!domainId,
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Hook for domain verification mutation
export const useDomainVerificationMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domain, domainId }: { domain: string; domainId: string }) => {
      const result = await checkDomainVerification(domain, domainId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to check verification')
      }
      return result
    },
    onSuccess: (data, { domainId }) => {
      // Simple invalidation - let react-query handle the rest
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.detail(domainId) })
    },
  })
}

// Hook for domain deletion mutation
export const useDomainDeletionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domain, domainId }: { domain: string; domainId: string }) => {
      const result = await deleteDomain(domain, domainId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete domain')
      }
      return result
    },
    onSuccess: (data, { domainId }) => {
      // Remove domain from cache and invalidate related queries
      queryClient.removeQueries({ queryKey: domainDetailsKeys.detail(domainId) })
      queryClient.removeQueries({ queryKey: domainDetailsKeys.catchAll(domainId) })
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['domainStats'] })
    },
  })
}

// Hook for adding email address mutation
export const useAddEmailAddressMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      domainId, 
      emailAddress, 
      webhookId,
      endpointId 
    }: { 
      domainId: string; 
      emailAddress: string; 
      webhookId?: string;
      endpointId?: string; 
    }) => {
      const result = await addEmailAddress(domainId, emailAddress, webhookId, endpointId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to add email address')
      }
      return result
    },
    onSuccess: (data, { domainId }) => {
      // Simple invalidation
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.detail(domainId) })
    },
  })
}

// Hook for deleting email address mutation
export const useDeleteEmailAddressMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      domainId, 
      emailAddressId 
    }: { 
      domainId: string; 
      emailAddressId: string 
    }) => {
      const result = await deleteEmailAddress(domainId, emailAddressId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete email address')
      }
      return result
    },
    onSuccess: (data, { domainId }) => {
      // Simple invalidation
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.detail(domainId) })
    },
  })
}

// Hook for updating email webhook/endpoint mutation
export const useUpdateEmailWebhookMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      domainId, 
      emailAddressId, 
      webhookId,
      endpointId 
    }: { 
      domainId: string; 
      emailAddressId: string; 
      webhookId?: string;
      endpointId?: string; 
    }) => {
      // Use the updated updateEmailWebhook function that supports both webhooks and endpoints
      const result = await updateEmailWebhook(domainId, emailAddressId, webhookId, endpointId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to update endpoint')
      }
      return result
    },
    onSuccess: (data, { domainId }) => {
      // Simple invalidation
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.detail(domainId) })
    },
  })
}

// Hook for enabling catch-all mutation
export const useEnableCatchAllMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      domainId, 
      webhookId,
      endpointId 
    }: { 
      domainId: string; 
      webhookId?: string;
      endpointId?: string; 
    }) => {
      const result = await enableDomainCatchAll(domainId, webhookId, endpointId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to enable catch-all')
      }
      return result
    },
    onSuccess: (data, { domainId }) => {
      // Invalidate both domain details and catch-all status
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.detail(domainId) })
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.catchAll(domainId) })
    },
  })
}

// Hook for disabling catch-all mutation
export const useDisableCatchAllMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ domainId }: { domainId: string }) => {
      const result = await disableDomainCatchAll(domainId)
      if (!result.success) {
        throw new Error(result.error || 'Failed to disable catch-all')
      }
      return result
    },
    onSuccess: (data, { domainId }) => {
      // Invalidate both domain details and catch-all status
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.detail(domainId) })
      queryClient.invalidateQueries({ queryKey: domainDetailsKeys.catchAll(domainId) })
    },
  })
} 