import { useQuery } from '@tanstack/react-query'
import { analyticsApi, type AnalyticsData } from '../api/analyticsApi'

// Query keys for analytics
export const analyticsKeys = {
  all: ['analytics'] as const,
  analytics: () => [...analyticsKeys.all, 'data'] as const,
}

export const useAnalyticsQuery = () => {
  return useQuery({
    queryKey: analyticsKeys.analytics(),
    queryFn: analyticsApi.getAnalytics,
  })
} 