import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateWebhook } from '@/app/actions/webhooks'
import { UpdateWebhookData } from '@/features/webhooks/types'

export const useUpdateWebhookMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWebhookData }) => {
      const result = await updateWebhook(id, data)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.webhook
    },
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['webhooks'] })

      // Snapshot the previous value
      const previousWebhooks = queryClient.getQueryData(['webhooks'])

      // Optimistically update to the new value
      queryClient.setQueryData(['webhooks'], (oldData: any) => {
        if (!oldData) return oldData
        return oldData.map((webhook: any) =>
          webhook.id === id ? { ...webhook, ...data, updatedAt: new Date() } : webhook
        )
      })

      // Return a context object with the snapshotted value
      return { previousWebhooks }
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousWebhooks) {
        queryClient.setQueryData(['webhooks'], context.previousWebhooks)
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })
} 