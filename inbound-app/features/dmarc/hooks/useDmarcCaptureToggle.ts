import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDomainDmarcCapture } from '../api/updateDomainDmarcCapture'
import type { UpdateDmarcCaptureData } from '../types'

export const useDmarcCaptureToggle = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      domainId, 
      isDmarcCaptureEnabled 
    }: { 
      domainId: string 
      isDmarcCaptureEnabled: boolean 
    }) => {
      const result = await updateDomainDmarcCapture(domainId, { isDmarcCaptureEnabled })
      if (!result.success) {
        throw new Error(result.error || 'Failed to update DMARC capture settings')
      }
      return result.domain
    },
    onSuccess: () => {
      // Invalidate domain queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['domain-details'] })
    },
  })
}