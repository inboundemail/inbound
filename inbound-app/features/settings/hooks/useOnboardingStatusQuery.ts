import { useQuery } from '@tanstack/react-query'
import { getOnboardingStatus } from '@/app/actions/onboarding'

export const useOnboardingStatusQuery = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => getOnboardingStatus(),
    enabled,
    staleTime: 15 * 60 * 1000, // 15 minutes - onboarding status rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes cache time
    retry: 1,
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnReconnect: false, // Don't refetch on reconnect
  })
}