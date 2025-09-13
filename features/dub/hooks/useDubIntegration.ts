"use client"

import { useQuery } from '@tanstack/react-query'

export function useDubIntegration() {
  return useQuery({
    queryKey: ['dub-integration-status'],
    queryFn: async () => {
      const res = await fetch('/api/linking/dub/status', { cache: 'no-store' })
      if (!res.ok) return { linked: false }
      return res.json()
    },
  })
}


