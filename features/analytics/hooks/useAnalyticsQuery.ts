import { useQuery } from '@tanstack/react-query'
import { getAnalytics, type AnalyticsData } from '@/app/actions/analytics'

// Query keys for analytics
export const analyticsKeys = {
  all: ['analytics'] as const,
  analytics: () => [...analyticsKeys.all, 'data'] as const,
}

export const useAnalyticsQuery = () => {
  return useQuery({
    queryKey: analyticsKeys.analytics(),
    queryFn: async () => {
      const result = await getAnalytics()
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
} 