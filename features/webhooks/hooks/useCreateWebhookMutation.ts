import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createWebhook } from '@/app/actions/webhooks'
import { CreateWebhookData } from '@/features/webhooks/types'

export const useCreateWebhookMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateWebhookData) => {
      const result = await createWebhook(data)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.webhook
    },
    onSuccess: (newWebhook) => {
      // Invalidate and refetch webhooks
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      
      // Optimistically update the cache
      queryClient.setQueryData(['webhooks'], (oldData: any) => {
        if (!oldData) return [newWebhook]
        return [...oldData, newWebhook]
      })
    },
    onError: (error) => {
      console.error('Error creating webhook:', error)
    },
  })
} 