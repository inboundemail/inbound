import { useMutation, useQueryClient } from '@tanstack/react-query'
import { migrateWebhooksToEndpoints } from '@/app/actions/endpoints'

export const useMigrationMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: migrateWebhooksToEndpoints,
    onSuccess: () => {
      // Invalidate and refetch endpoints query after successful migration
      queryClient.invalidateQueries({ queryKey: ['endpoints'] })
    },
  })
} 