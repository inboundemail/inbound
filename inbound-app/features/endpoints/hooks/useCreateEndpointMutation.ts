import { useMutation, useQueryClient } from '@tanstack/react-query'
import { track } from '@vercel/analytics'
import type { CreateEndpointData, Endpoint } from '../types'

async function createEndpoint(data: CreateEndpointData): Promise<Endpoint> {
  const response = await fetch('/api/v2/endpoints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create endpoint')
  }
  
  const result = await response.json()
  return result
}

export const useCreateEndpointMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: createEndpoint,
    onSuccess: (endpoint) => {
      // Track endpoint creation
      track('Endpoint Created', {
        endpointType: endpoint.type,
        endpointName: endpoint.name,
        endpointId: endpoint.id
      })
      
      // Invalidate and refetch endpoints list
      queryClient.invalidateQueries({ queryKey: ['endpoints'] })
    },
  })
} 