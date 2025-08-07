/**
 * Centralized React Query client configuration for the entire application.
 * Provides consistent defaults for caching, retries, and refetch behavior.
 * Used by QueryProvider to enable react-query functionality app-wide.
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: 5 minutes - data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache time: 10 minutes - data stays in cache for 10 minutes after becoming unused
      gcTime: 10 * 60 * 1000,
      // Retry failed requests 3 times with exponential backoff
      retry: 3,
      // Refetch on window focus for fresh data
      refetchOnWindowFocus: true,
      // Refetch on reconnect
      refetchOnReconnect: true,
      // Don't refetch on mount if data is fresh
      refetchOnMount: true,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
}) 