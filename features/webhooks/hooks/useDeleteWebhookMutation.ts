import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteWebhook } from '@/app/actions/webhooks'

export const useDeleteWebhookMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteWebhook(id)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result
    },
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['webhooks'] })

      // Snapshot the previous value
      const previousWebhooks = queryClient.getQueryData(['webhooks'])

      // Optimistically update to the new value
      queryClient.setQueryData(['webhooks'], (oldData: any) => {
        if (!oldData) return oldData
        return oldData.filter((webhook: any) => webhook.id !== id)
      })

      // Return a context object with the snapshotted value
      return { previousWebhooks }
    },
    onError: (err, id, context) => {
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