import { useQuery } from '@tanstack/react-query'
import { getUserEmailLogs } from '@/app/actions/primary'
import type { EmailLogsOptions, EmailLogsResponse } from '../types'

export function useUserEmailLogsQuery(options: EmailLogsOptions = {}) {
  return useQuery({
    queryKey: ['user-email-logs', options],
    queryFn: async () => {
      const result = await getUserEmailLogs(options)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data as EmailLogsResponse
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
} 