"use client"

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'
import { useDomainsListV2Query, useUpgradeDomainMailFromV2Mutation } from '@/features/domains/hooks/useDomainV2Hooks'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { toast } from 'sonner'

// Import Nucleo icons
import Globe2 from '@/components/icons/globe-2'
import Envelope2 from '@/components/icons/envelope-2'
import CirclePlus from '@/components/icons/circle-plus'
import Refresh2 from '@/components/icons/refresh-2'
import ObjRemove from '@/components/icons/obj-remove'
import Magnifier2 from '@/components/icons/magnifier-2'
import Filter2 from '@/components/icons/filter-2'
import ArrowUpRight2 from '@/components/icons/arrow-up-right-2'
import type { DomainWithStats } from '@/app/api/v2/domains/route'
import Check2 from '@/components/icons/check-2'

export default function EmailsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [upgradingDomains, setUpgradingDomains] = useState<Set<string>>(new Set())

  // Debounce inputs to reduce API calls
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const debouncedStatus = useDebouncedValue(statusFilter, 150)

  // Fetch domains using v2 API
  const {
    data: domainsResponse,
    isLoading,
    error,
    refetch: refetchDomains
  } = useDomainsListV2Query({ limit: 100 })

  // MAIL FROM upgrade mutation
  const upgradeMailFromMutation = useUpgradeDomainMailFromV2Mutation()

  // Helper functions for domain status
  const getDomainStatusDot = (domain: DomainWithStats) => {
    if (domain.status === 'verified' && domain.canReceiveEmails) {
      return <div className="w-2 h-2 rounded-full bg-green-500" />
    } else if (domain.status === 'verified') {
      return <div className="w-2 h-2 rounded-full bg-yellow-500" />
    } else {
      return <div className="w-2 h-2 rounded-full bg-red-500" />
    }
  }

  const getDomainStatusText = (domain: DomainWithStats) => {
    if (domain.status === 'verified' && domain.canReceiveEmails) {
      return "Active"
    } else if (domain.status === 'verified') {
      return "Verified"
    } else {
      return "Pending"
    }
  }

  const handleUpgradeDomain = async (domainId: string, event: React.MouseEvent) => {
    event.preventDefault() // Prevent navigation
    event.stopPropagation()
    
    setUpgradingDomains(prev => new Set(prev).add(domainId))
    
    try {
      const result = await upgradeMailFromMutation.mutateAsync({ domainId })
      toast.success(
        result.alreadyConfigured 
          ? 'Domain already has MAIL FROM configured' 
          : 'Domain upgraded! Check DNS records for mail.yourdomain.com',
        { duration: 5000 }
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to upgrade domain'
      )
    } finally {
      setUpgradingDomains(prev => {
        const newSet = new Set(prev)
        newSet.delete(domainId)
        return newSet
      })
    }
  }



  // Process and filter data
  const domains = domainsResponse?.data || []

  // Filter domains based on search query
  const filteredDomains = domains.filter(domain => {
    if (!debouncedSearch) return true
    return domain.domain.toLowerCase().includes(debouncedSearch.toLowerCase())
  })

  // Error state
  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
            <div className="flex items-center gap-2 text-destructive">
              <ObjRemove width="16" height="16" />
              <span>{error.message}</span>
              <Button variant="ghost" size="sm" onClick={() => refetchDomains()} className="ml-auto text-destructive hover:text-destructive/80">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
                Domains
              </h2>
              <p className="text-muted-foreground text-sm font-medium">
                {domainsResponse?.pagination.total || 0} domains
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" asChild>
                <Link href="/add">
                  <CirclePlus width="12" height="12" className="mr-1" />
                  Add Domain
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchDomains()}
                disabled={isLoading}
              >
                <Refresh2 width="14" height="14" className="mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search domains..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 rounded-xl"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="configured">Configured</SelectItem>
                <SelectItem value="unconfigured">Unconfigured</SelectItem>
              </SelectContent>
            </Select>

            {(searchQuery || statusFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                }}
                className="h-9"
              >
                <Filter2 width="14" height="14" className="mr-2" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Domains Table - Edge to Edge */}
      <div className="w-full max-w-6xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading domains...</div>
          </div>
        ) : !filteredDomains.length ? (
          <div className="max-w-6xl mx-auto p-4">
            <div className="bg-card border-border rounded-xl p-8">
              <div className="text-center">
                <Globe2 width="48" height="48" className="text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-foreground">No domains found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your filters or search query.'
                    : 'Start by adding a domain to create email addresses.'}
                </p>
                <Button variant="secondary" asChild>
                  <Link href="/add">
                    <CirclePlus width="16" height="16" className="mr-2" />
                    Add Your First Domain
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredDomains.map((domain) => (
              <Link 
                key={domain.id}
                href={`/emails/${domain.id}`}
                className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors cursor-pointer group block"
              >
                {/* Domain Icon with Status */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    <Globe2 width="16" height="16" className="text-blue-600" />
                    <div className="absolute -top-1 -right-1">
                      {getDomainStatusDot(domain)}
                    </div>
                  </div>
                </div>

                {/* Domain Name */}
                <div className="flex-shrink-0 w-64">
                  <span className="text-sm font-medium">{domain.domain}</span>
                </div>

                {/* Email Count */}
                <div className="flex-shrink-0 w-32">
                  <div className="flex items-center gap-2">
                    <Envelope2 width="12" height="12" className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {domain.stats.totalEmailAddresses} address{domain.stats.totalEmailAddresses !== 1 ? 'es' : ''}
                    </span>
                  </div>
                </div>

                {/* Domain Status */}
                <div className="flex-shrink-0 w-24">
                  <Badge 
                    variant={domain.status === 'verified' && domain.canReceiveEmails ? 'default' : 
                             domain.status === 'verified' ? 'secondary' : 'destructive'}
                  >
                    {getDomainStatusText(domain)}
                  </Badge>
                </div>

                {/* MAIL FROM Status Badge */}
                <div className="flex-shrink-0 w-32">
                  {domain.status === 'verified' && !domain.mailFromDomain && (
                    <Badge variant="outline">
                      Upgrade Available
                    </Badge>
                  )}
                  {/* {domain.mailFromDomain && (
                    <Badge variant="secondary" className="text-xs">
                      <Check2 width="12" height="12" className="mr-1 inline-block" />
                      Enhanced Identity
                    </Badge>
                  )} */}
                </div>

                {/* Configuration Type */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {domain.isCatchAllEnabled ? 'Catch-all enabled' : 'Individual addresses'}
                    </span>
                    {domain.status === 'verified' && !domain.mailFromDomain && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={(e) => handleUpgradeDomain(domain.id, e)}
                        disabled={upgradingDomains.has(domain.id)}
                      >
                        {upgradingDomains.has(domain.id) ? 'Upgrading...' : 'Upgrade'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Created */}
                <div className="flex-shrink-0 text-xs text-muted-foreground w-20">
                  {format(new Date(domain.createdAt), 'MMM d')}
                </div>

                {/* Arrow Icon */}
                <div className="flex-shrink-0">
                  <ArrowUpRight2 width="12" height="12" className="text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

 