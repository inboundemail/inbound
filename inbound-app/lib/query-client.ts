/**
 * Centralized React Query client configuration for the entire application.
 * Provides consistent defaults for caching, retries, and refetch behavior.
 * Used by QueryProvider to enable react-query functionality app-wide.
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: 2 minutes - data is considered fresh for 2 minutes
      staleTime: 2 * 60 * 1000,
      // Cache time: 10 minutes - data stays in cache for 10 minutes after becoming unused
      gcTime: 10 * 60 * 1000,
      // Retry failed requests 2 times with exponential backoff (reduced for faster navigation)
      retry: 2,
      // Don't refetch on window focus during navigation (reduces unnecessary requests)
      refetchOnWindowFocus: false,
      // Refetch on reconnect
      refetchOnReconnect: true,
      // Only refetch on mount if data is stale (improves navigation performance)
      refetchOnMount: 'stale',
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
}) 