import { useQuery } from '@tanstack/react-query'
import { authClient } from '@/lib/auth/auth-client'

export const useApiKeysQuery = () => {
  return useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const { data, error } = await authClient.apiKey.list()
      if (error) {
        throw new Error(error.message)
      }

      // Process the data to ensure allowedDomains is properly parsed
      const processedData = (data || []).map((apiKey: any) => ({
        ...apiKey,
        allowedDomains: apiKey.allowedDomains
          ? typeof apiKey.allowedDomains === 'string'
            ? JSON.parse(apiKey.allowedDomains)
            : apiKey.allowedDomains
          : null
      }))

      return processedData
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
} 