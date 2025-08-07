import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '@/lib/auth/auth-client'
import { CreateApiKeyData, UpdateApiKeyData } from '@/features/settings/types'

export const useCreateApiKeyMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateApiKeyData) => {
      const { data: result, error } = await authClient.apiKey.create(data)
      if (error) {
        throw new Error(error.message)
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
  })
}

export const useUpdateApiKeyMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ keyId, ...updates }: UpdateApiKeyData) => {
      const { error } = await authClient.apiKey.update({ keyId, ...updates })
      if (error) {
        throw new Error(error.message)
      }
    },
    onMutate: async ({ keyId, ...updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['apiKeys'] })

      // Snapshot the previous value
      const previousApiKeys = queryClient.getQueryData(['apiKeys'])

      // Optimistically update to the new value
      queryClient.setQueryData(['apiKeys'], (oldData: any) => {
        if (!oldData) return oldData
        return oldData.map((apiKey: any) =>
          apiKey.id === keyId ? { ...apiKey, ...updates } : apiKey
        )
      })

      return { previousApiKeys }
    },
    onError: (err, variables, context) => {
      if (context?.previousApiKeys) {
        queryClient.setQueryData(['apiKeys'], context.previousApiKeys)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
  })
}

export const useDeleteApiKeyMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await authClient.apiKey.delete({ keyId })
      if (error) {
        throw new Error(error.message)
      }
    },
    onMutate: async (keyId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['apiKeys'] })

      // Snapshot the previous value
      const previousApiKeys = queryClient.getQueryData(['apiKeys'])

      // Optimistically update to the new value
      queryClient.setQueryData(['apiKeys'], (oldData: any) => {
        if (!oldData) return oldData
        return oldData.filter((apiKey: any) => apiKey.id !== keyId)
      })

      return { previousApiKeys }
    },
    onError: (err, keyId, context) => {
      if (context?.previousApiKeys) {
        queryClient.setQueryData(['apiKeys'], context.previousApiKeys)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
  })
} 