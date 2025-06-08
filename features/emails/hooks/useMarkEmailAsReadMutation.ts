'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { markEmailAsRead } from '@/app/actions/primary'
import { toast } from 'sonner'

export const useMarkEmailAsReadMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (emailId: string) => {
      const result = await markEmailAsRead(emailId)
      
      if (result.error) {
        throw new Error(result.error)
      }
      
      return result.data
    },
    onSuccess: (data, emailId) => {
      // Invalidate and refetch email queries to update read status
      queryClient.invalidateQueries({ queryKey: ['email', emailId] })
      
      // Also invalidate analytics/mail list queries that might show read status
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      
      // Optional: Show success toast
      // toast.success('Email marked as read')
    },
    // Optimistic updates can be added here if needed
    onMutate: async (emailId) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['email', emailId] })

      // Snapshot the previous value
      const previousEmail = queryClient.getQueryData(['email', emailId])

      // Optimistically update to the new value
      queryClient.setQueryData(['email', emailId], (old: any) => {
        if (!old) return old
        return {
          ...old,
          isRead: true,
          readAt: new Date(),
        }
      })

      // Return a context object with the snapshotted value
      return { previousEmail }
    },
    onError: (err, emailId, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousEmail) {
        queryClient.setQueryData(['email', emailId], context.previousEmail)
      }
      console.error('Failed to mark email as read:', err)
      toast.error('Failed to mark email as read')
    },
    onSettled: (data, error, emailId) => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ['email', emailId] })
    },
  })
} 