import { useMutation, useQueryClient } from '@tanstack/react-query'

async function deleteEndpoint(id: string): Promise<{ message?: string; emailAddressesUpdated?: number }> {
  const response = await fetch(`/api/v2/endpoints/${id}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete endpoint')
  }
  
  const data = await response.json()
  return data
}

export const useDeleteEndpointMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteEndpoint,
    onSuccess: () => {
      // Invalidate and refetch endpoints list
      queryClient.invalidateQueries({ queryKey: ['endpoints'] })
    },
  })
} 