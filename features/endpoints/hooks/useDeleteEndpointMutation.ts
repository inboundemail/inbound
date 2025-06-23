import { useMutation, useQueryClient } from '@tanstack/react-query'

async function deleteEndpoint(id: string): Promise<void> {
  const response = await fetch(`/api/v1/endpoints/${id}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete endpoint')
  }
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