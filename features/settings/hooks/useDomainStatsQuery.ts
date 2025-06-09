import { useQuery } from '@tanstack/react-query'
import { getDomainStats } from '@/app/actions/primary'

export const useDomainStatsQuery = () => {
  return useQuery({
    queryKey: ['domainStats'],
    queryFn: async () => {
      const result = await getDomainStats()
      if ('error' in result) {
        throw new Error(result.error)
      }
      return result
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
} 