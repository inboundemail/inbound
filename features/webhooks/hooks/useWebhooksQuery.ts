import { useQuery } from '@tanstack/react-query'
import { getWebhooks } from '@/app/actions/webhooks'

export const useWebhooksQuery = () => {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const result = await getWebhooks()
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.webhooks
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
} 