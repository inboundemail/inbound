import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

// Types from the search API
export interface SearchResult {
  domains: DomainResult[]
  addresses: AddressResult[]
  endpoints: EndpointResult[]
  emails?: EmailResult[]
}

export interface DomainResult {
  id: string
  domain: string
  status: string
  canReceiveEmails: boolean
}

export interface AddressResult {
  id: string
  address: string
  domainId: string
  domain: string
  isActive: boolean
  endpointName?: string
}

export interface EndpointResult {
  id: string
  name: string
  type: string
  description?: string
  isActive: boolean
  config: string
}

export interface EmailResult {
  id: string
  from: string
  to: string
  subject: string
  receivedAt: string
  messageId: string
}

export interface SearchResponse {
  success: boolean
  data?: SearchResult
  error?: string
  fallbackUsed?: boolean
  query: string
}

// Hook for search functionality
export function useSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  // React Query for search API
  const {
    data: searchResults,
    isLoading,
    error,
    isFetching
  } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async (): Promise<SearchResponse> => {
      if (!debouncedQuery.trim()) {
        return {
          success: true,
          data: { domains: [], addresses: [], endpoints: [] },
          query: debouncedQuery
        }
      }

      const response = await fetch(`/api/internal/search?q=${encodeURIComponent(debouncedQuery)}`)
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      return response.json()
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // 1 minute
  })

  // Helper to get total results count
  const getTotalResults = useCallback(() => {
    if (!searchResults?.data) return 0
    
    const { domains, addresses, endpoints, emails } = searchResults.data
    return (domains?.length || 0) + 
           (addresses?.length || 0) + 
           (endpoints?.length || 0) + 
           (emails?.length || 0)
  }, [searchResults])

  // Helper to check if search is active
  const hasActiveSearch = debouncedQuery.trim().length > 0

  return {
    searchQuery,
    updateSearchQuery,
    searchResults: searchResults?.data,
    isLoading: isLoading || isFetching,
    error: error || searchResults?.error,
    hasActiveSearch,
    fallbackUsed: searchResults?.fallbackUsed || false,
    totalResults: getTotalResults(),
    clearSearch: () => {
      setSearchQuery('')
      setDebouncedQuery('')
    }
  }
}
