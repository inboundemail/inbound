import { useQuery } from '@tanstack/react-query'
import type { Endpoint } from '../types'

async function fetchEndpoints(): Promise<Endpoint[]> {
  const response = await fetch('/api/v1/endpoints')
  
  if (!response.ok) {
    throw new Error('Failed to fetch endpoints')
  }
  
  const data = await response.json()
  return data.endpoints || []
}

export const useEndpointsQuery = () => {
  return useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
} 