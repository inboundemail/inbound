import { useQuery } from '@tanstack/react-query'
import { getOnboardingStatus } from '@/app/actions/onboarding'

export const useOnboardingStatusQuery = () => {
  return useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => getOnboardingStatus(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
} 