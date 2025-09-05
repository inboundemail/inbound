import { useMutation } from '@tanstack/react-query'
import { generateAutumnBillingPortal } from '@/app/actions/primary'

export const useBillingPortalMutation = () => {
  return useMutation({
    mutationFn: async () => {
      const result = await generateAutumnBillingPortal()
      if (result.error) {
        throw new Error(result.error)
      }
      return result.url
    },
  })
} 