import { useMutation, useQueryClient } from '@tanstack/react-query'
import { testWebhook } from '@/app/actions/webhooks'

export const useTestWebhookMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await testWebhook(id)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result
    },
    onSuccess: () => {
      // Invalidate webhooks to refresh stats after test
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error) => {
      console.error('Error testing webhook:', error)
    },
  })
} 