import { useMutation, useQueryClient } from '@tanstack/react-query'
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
    onSuccess: () => {
      // Invalidate and refetch endpoints list
      queryClient.invalidateQueries({ queryKey: ['endpoints'] })
    },
  })
} 