import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteMultipleEndpoints } from '@/app/actions/endpoints'

export const useDeleteMultipleEndpointsMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteMultipleEndpoints,
    onSuccess: () => {
      // Invalidate and refetch endpoints list
      queryClient.invalidateQueries({ queryKey: ['endpoints'] })
    },
  })
} 