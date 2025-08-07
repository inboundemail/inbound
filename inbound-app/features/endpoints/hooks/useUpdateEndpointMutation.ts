import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UpdateEndpointData, Endpoint } from '../types'

async function updateEndpoint(params: { id: string; data: UpdateEndpointData }): Promise<Endpoint> {
  const { id, data } = params
  const response = await fetch(`/api/v2/endpoints/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update endpoint')
  }
  
  const result = await response.json()
  return result
}

export const useUpdateEndpointMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: updateEndpoint,
    onSuccess: () => {
      // Invalidate and refetch endpoints list
      queryClient.invalidateQueries({ queryKey: ['endpoints'] })
    },
  })
} 