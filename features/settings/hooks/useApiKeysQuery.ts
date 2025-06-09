import { useQuery } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'

export const useApiKeysQuery = () => {
  return useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const { data, error } = await authClient.apiKey.list()
      if (error) {
        throw new Error(error.message)
      }
      return data || []
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
} 