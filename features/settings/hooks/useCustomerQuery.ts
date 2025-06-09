import { useQuery } from '@tanstack/react-query'
import { getAutumnCustomer } from '@/app/actions/primary'

export const useCustomerQuery = () => {
  return useQuery({
    queryKey: ['customer'],
    queryFn: async () => {
      const result = await getAutumnCustomer()
      if (result.error) {
        throw new Error(result.error)
      }
      return result.customer
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
} 