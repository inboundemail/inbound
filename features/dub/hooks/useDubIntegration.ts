"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type DubDomain = {
  id: string
  slug: string
  verified: boolean
  primary: boolean
}

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

type DomainsResponse = DubDomain[] | { error?: string; needsRelink?: boolean }

export function useDubDomainsQuery(enabled: boolean = true) {
  return useQuery<DomainsResponse>({
    queryKey: ['dub-domains'],
    queryFn: async () => {
      const res = await fetch('/api/linking/dub/domains', { cache: 'no-store' })
      if (!res.ok) {
        // Return JSON so caller can show relink hint
        const data = await res.json().catch(() => ({ error: 'Failed to load Dub domains' }))
        return data as DomainsResponse
      }
      return res.json()
    },
    staleTime: 60_000,
    enabled,
  })
}

export function useDefaultDubDomainQuery(enabled: boolean = true) {
  return useQuery<{ id: string | null; slug: string | null }>({
    queryKey: ['dub-default-domain'],
    queryFn: async () => {
      const res = await fetch('/api/linking/dub/default-domain', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load default Dub domain')
      return res.json()
    },
    enabled,
  })
}

export function useSetDefaultDubDomainMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id?: string | null; slug?: string | null }) => {
      const res = await fetch('/api/linking/dub/default-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Failed to save default domain')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dub-default-domain'] })
      qc.invalidateQueries({ queryKey: ['dub-integration-status'] })
    },
  })
}

// Folders
type DubFolder = { id: string; name: string }
type FoldersResponse = DubFolder[] | { error?: string; needsRelink?: boolean }

export function useDubFoldersQuery(enabled: boolean = true) {
  return useQuery<FoldersResponse>({
    queryKey: ['dub-folders'],
    queryFn: async () => {
      const res = await fetch('/api/linking/dub/folders', { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to load folders' }))
        return data as FoldersResponse
      }
      return res.json()
    },
    staleTime: 60_000,
    enabled,
  })
}

export function useDefaultDubFolderQuery(enabled: boolean = true, ensureInbound: boolean = false) {
  return useQuery<{ id: string | null; name: string | null }>({
    queryKey: ['dub-default-folder', ensureInbound],
    queryFn: async () => {
      const url = new URL('/api/linking/dub/default-folder', window.location.origin)
      if (ensureInbound) url.searchParams.set('ensureInbound', 'true')
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load default folder')
      return res.json()
    },
    enabled,
  })
}

export function useSetDefaultDubFolderMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id?: string | null; name?: string | null; ensureInbound?: boolean }) => {
      const res = await fetch('/api/linking/dub/default-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Failed to save default folder')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dub-default-folder'] })
      qc.invalidateQueries({ queryKey: ['dub-folders'] })
    },
  })
}

// Email links toggle
export function useEmailLinksToggleQuery(enabled: boolean = true) {
  return useQuery<{ enabled: boolean }>({
    queryKey: ['dub-email-links-enabled'],
    queryFn: async () => {
      const res = await fetch('/api/linking/dub/email-links', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load email links toggle')
      return res.json()
    },
    enabled,
  })
}

export function useSetEmailLinksToggleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch('/api/linking/dub/email-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed to save email links toggle')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dub-email-links-enabled'] })
    },
  })
}


