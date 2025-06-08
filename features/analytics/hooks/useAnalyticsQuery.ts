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
    // Refetch every 30 seconds for real-time data
    refetchInterval: 30 * 1000,
    // Keep previous data while refetching to prevent loading states
    placeholderData: (previousData) => previousData,
    // Consider data stale after 1 minute
    staleTime: 1 * 60 * 1000,
    // Refetch on window focus for fresh data
    refetchOnWindowFocus: true,
    // Retry failed requests
    retry: 3,
  })
} 