/**
 * Optimized Email Thread Hook
 * 
 * Provides performance-optimized email thread fetching with:
 * - Intelligent caching strategies
 * - Background refetching
 * - Stale-while-revalidate pattern
 * - Error boundaries and retry logic
 * - Memory-efficient data structures
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { ThreadingResult } from '@/lib/email-management/improved-threading'

// Optimized query keys with proper serialization
export const optimizedEmailKeys = {
  all: ['emails', 'optimized'] as const,
  threads: () => [...optimizedEmailKeys.all, 'threads'] as const,
  thread: (emailId: string) => [...optimizedEmailKeys.threads(), emailId] as const,
  threadDetails: (emailId: string, options?: { includeRead?: boolean }) => 
    [...optimizedEmailKeys.thread(emailId), 'details', options] as const,
  markAsRead: () => [...optimizedEmailKeys.all, 'markAsRead'] as const,
}

interface UseOptimizedEmailThreadOptions {
  /**
   * Enable background refetching when thread is likely to have new messages
   * @default true
   */
  enableBackgroundRefetch?: boolean
  
  /**
   * Stale time in milliseconds - how long data is considered fresh
   * @default 2 minutes
   */
  staleTime?: number
  
  /**
   * Cache time in milliseconds - how long data stays in cache when not used
   * @default 10 minutes
   */
  cacheTime?: number
  
  /**
   * Enable optimistic updates for read status
   * @default true
   */
  enableOptimisticUpdates?: boolean
  
  /**
   * Retry failed requests
   * @default 3
   */
  retryCount?: number
  
  /**
   * Include read messages in thread
   * @default true
   */
  includeRead?: boolean
  
  /**
   * Prefetch related threads (experimental)
   * @default false
   */
  prefetchRelated?: boolean
}

interface OptimizedThreadData extends ThreadingResult {
  /**
   * Cached timestamp for staleness detection
   */
  cachedAt: number
  
  /**
   * Whether this thread likely has new messages
   */
  hasNewMessages: boolean
  
  /**
   * Performance metadata
   */
  performance: {
    fetchTime: number
    threadingMethod: string
    messageCount: number
    confidence: string
  }
}

/**
 * Optimized hook for fetching email threads with advanced caching
 */
export function useOptimizedEmailThreadV2(
  emailId: string,
  options: UseOptimizedEmailThreadOptions = {}
) {
  const {
    enableBackgroundRefetch = true,
    staleTime = 2 * 60 * 1000, // 2 minutes
    cacheTime = 10 * 60 * 1000, // 10 minutes
    enableOptimisticUpdates = true,
    retryCount = 3,
    includeRead = true,
    prefetchRelated = false
  } = options

  const queryClient = useQueryClient()

  // Main thread query with optimizations
  const threadQuery = useQuery({
    queryKey: optimizedEmailKeys.threadDetails(emailId, { includeRead }),
    queryFn: async (): Promise<OptimizedThreadData> => {
      const startTime = performance.now()
      
      // Call the improved threading API
      const response = await fetch(`/api/v2/mail/${emailId}/thread/optimized`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `HTTP error! status: ${response.status}`)
      }

      const threadData: ThreadingResult = await response.json()
      const fetchTime = performance.now() - startTime

      // Enhance with optimization metadata
      const optimizedData: OptimizedThreadData = {
        ...threadData,
        cachedAt: Date.now(),
        hasNewMessages: false, // Will be determined by background checks
        performance: {
          fetchTime,
          threadingMethod: threadData.threadingMethod,
          messageCount: threadData.messages.length,
          confidence: threadData.confidence
        }
      }

      // Prefetch related threads if enabled
      if (prefetchRelated && threadData.messages.length > 1) {
        queueMicrotask(() => {
          prefetchRelatedThreads(threadData, queryClient)
        })
      }

      return optimizedData
    },
    enabled: !!emailId,
    staleTime,
    gcTime: cacheTime,
    retry: (failureCount, error) => {
      // Don't retry on 404 or 403 errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase()
        if (message.includes('404') || message.includes('403') || message.includes('not found')) {
          return false
        }
      }
      return failureCount < retryCount
    },
    refetchOnWindowFocus: enableBackgroundRefetch,
    refetchOnMount: 'always',
    // Enable background refetching for active threads
    refetchInterval: enableBackgroundRefetch ? 30000 : false, // 30 seconds
    refetchIntervalInBackground: false,
    // Optimize network usage
    networkMode: 'online',
    // Enable stale-while-revalidate pattern
    refetchOnReconnect: true,
  })

  // Optimized mark as read mutation
  const markAsReadMutation = useMutation({
    mutationKey: optimizedEmailKeys.markAsRead(),
    mutationFn: async (messageId: string) => {
      const response = await fetch(`/api/v2/mail/${messageId}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to mark as read')
      }

      return response.json()
    },
    onMutate: async (messageId: string) => {
      if (!enableOptimisticUpdates) return

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: optimizedEmailKeys.threadDetails(emailId, { includeRead }) 
      })

      // Snapshot current data
      const previousData = queryClient.getQueryData<OptimizedThreadData>(
        optimizedEmailKeys.threadDetails(emailId, { includeRead })
      )

      // Optimistically update
      if (previousData) {
        const optimisticData: OptimizedThreadData = {
          ...previousData,
          messages: previousData.messages.map(message => 
            message.id === messageId 
              ? { ...message, isRead: true, readAt: new Date() }
              : message
          ),
          cachedAt: Date.now()
        }

        queryClient.setQueryData(
          optimizedEmailKeys.threadDetails(emailId, { includeRead }),
          optimisticData
        )
      }

      return { previousData }
    },
    onError: (error, messageId, context) => {
      // Rollback optimistic update
      if (context?.previousData) {
        queryClient.setQueryData(
          optimizedEmailKeys.threadDetails(emailId, { includeRead }),
          context.previousData
        )
      }
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: optimizedEmailKeys.threads()
      })
    }
  })

  // Memoized selectors for performance
  const threadData = useMemo(() => threadQuery.data, [threadQuery.data])
  
  const unreadMessages = useMemo(() => 
    threadData?.messages.filter(message => !message.isRead) || [],
    [threadData?.messages]
  )

  const latestMessage = useMemo(() => 
    threadData?.messages[threadData.messages.length - 1],
    [threadData?.messages]
  )

  const threadParticipants = useMemo(() => {
    if (!threadData?.messages) return []
    
    const participants = new Set<string>()
    threadData.messages.forEach(message => {
      if (message.addresses.from?.addresses) {
        message.addresses.from.addresses.forEach(addr => {
          if (addr.address) participants.add(addr.address)
        })
      }
      if (message.addresses.to?.addresses) {
        message.addresses.to.addresses.forEach(addr => {
          if (addr.address) participants.add(addr.address)
        })
      }
    })
    
    return Array.from(participants)
  }, [threadData?.messages])

  // Prefetch next/previous threads in list
  const prefetchAdjacentThreads = useCallback(async (direction: 'next' | 'prev') => {
    // This would require additional context about the email list
    // Implementation depends on how the email list is structured
    console.log(`Prefetching ${direction} thread for performance`)
  }, [])

  // Background sync for real-time updates
  const syncThread = useCallback(async () => {
    if (!enableBackgroundRefetch) return
    
    try {
      await queryClient.refetchQueries({
        queryKey: optimizedEmailKeys.thread(emailId),
        type: 'active'
      })
    } catch (error) {
      console.error('Background sync failed:', error)
    }
  }, [queryClient, emailId, enableBackgroundRefetch])

  // Memory cleanup
  const cleanupCache = useCallback(() => {
    queryClient.removeQueries({
      queryKey: optimizedEmailKeys.thread(emailId),
      exact: false
    })
  }, [queryClient, emailId])

  return {
    // Core data
    data: threadData,
    messages: threadData?.messages || [],
    threadId: threadData?.threadId,
    confidence: threadData?.confidence || 'low',
    threadingMethod: threadData?.threadingMethod || 'message-id',
    
    // Derived data
    unreadMessages,
    latestMessage,
    threadParticipants,
    messageCount: threadData?.messages.length || 0,
    hasUnread: unreadMessages.length > 0,
    
    // Query state
    isLoading: threadQuery.isLoading,
    isFetching: threadQuery.isFetching,
    isError: threadQuery.isError,
    error: threadQuery.error,
    isStale: threadQuery.isStale,
    
    // Performance data
    performance: threadData?.performance,
    cachedAt: threadData?.cachedAt,
    
    // Actions
    markAsRead: markAsReadMutation.mutateAsync,
    markAsReadMutation,
    refetch: threadQuery.refetch,
    syncThread,
    prefetchAdjacentThreads,
    cleanupCache,
    
    // Advanced features
    invalidateThread: () => queryClient.invalidateQueries({
      queryKey: optimizedEmailKeys.thread(emailId)
    }),
    
    // Debugging
    debug: {
      queryKey: optimizedEmailKeys.threadDetails(emailId, { includeRead }),
      cacheStatus: queryClient.getQueryState(
        optimizedEmailKeys.threadDetails(emailId, { includeRead })
      ),
    }
  }
}

/**
 * Prefetch related threads based on participants and subject similarity
 */
async function prefetchRelatedThreads(
  threadData: ThreadingResult, 
  queryClient: ReturnType<typeof useQueryClient>
) {
  // Extract participants from current thread
  const participants = new Set<string>()
  threadData.messages.forEach(message => {
    if (message.addresses.from?.addresses) {
      message.addresses.from.addresses.forEach(addr => {
        if (addr.address) participants.add(addr.address)
      })
    }
  })

  // This would require an API endpoint to find related threads
  // For now, we'll just log the intent
  console.log('Would prefetch threads for participants:', Array.from(participants))
}

/**
 * Utility hook for bulk operations on threads
 */
export function useOptimizedThreadBulkOperations() {
  const queryClient = useQueryClient()

  const bulkMarkAsRead = useMutation({
    mutationFn: async (emailIds: string[]) => {
      const response = await fetch('/api/v2/mail/bulk/mark-read', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailIds })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to bulk mark as read')
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate all thread queries
      queryClient.invalidateQueries({
        queryKey: optimizedEmailKeys.threads()
      })
    }
  })

  return {
    bulkMarkAsRead: bulkMarkAsRead.mutateAsync,
    bulkMarkAsReadMutation: bulkMarkAsRead
  }
}
