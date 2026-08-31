"use client"

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import Link from 'next/link'
import { useQueryStates, parseAsString } from 'nuqs'
import { useDomainsListV2Query, type E2DomainWithStats } from '@/features/domains/hooks/useDomainV2Hooks'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'


// Import Nucleo icons
import Globe2 from '@/components/icons/globe-2'
import Envelope2 from '@/components/icons/envelope-2'
import CirclePlus from '@/components/icons/circle-plus'
import Refresh2 from '@/components/icons/refresh-2'
import CircleXmark from '@/components/icons/circle-xmark'
import Magnifier2 from '@/components/icons/magnifier-2'
import Filter2 from '@/components/icons/filter-2'
import { ApiIdLabel } from '@/components/api-id-label'
import SidebarToggleButton from '@/components/sidebar-toggle-button'

export default function EmailsPage() {
  // Search and filter state with URL persistence
  const [filters, setFilters] = useQueryStates({
    search: parseAsString.withDefault(''),
    status: parseAsString.withDefault('all'),
  }, { history: 'push' })

  const searchQuery = filters.search
  const statusFilter = filters.status

  const setSearchQuery = (value: string) => setFilters({ search: value || null })
  const setStatusFilter = (value: string) => setFilters({ status: value === 'all' ? null : value })

  // Debounce inputs to reduce API calls
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const debouncedStatus = useDebouncedValue(statusFilter, 150)

  // Fetch domains using v2 API
  const {
    data: domainsResponse,
    isLoading,
    error,
    refetch: refetchDomains
  } = useDomainsListV2Query({ limit: 100, fetchAll: true })



  // Helper functions for domain status (only Active/Inactive)
  const isActive = (d: E2DomainWithStats) => d.status === 'verified' && d.canReceiveEmails

  const getDomainStatusDot = (domain: E2DomainWithStats) => {
    return <div className={`w-2 h-2 rounded-full ${isActive(domain) ? 'bg-green-500' : 'bg-red-500'}`} />
  }

  const getDomainStatusText = (domain: E2DomainWithStats) => {
    return isActive(domain) ? "Active" : "Inactive"
  }


  // Process and filter data
  const domains = domainsResponse?.data || []

  // Filter domains based on search query and status dropdown
  const q = debouncedSearch.trim().toLowerCase()
  const statusMatch = (d: E2DomainWithStats) =>
    debouncedStatus === 'all'
      ? true
      : debouncedStatus === 'active'
        ? isActive(d)
        : debouncedStatus === 'inactive'
          ? !isActive(d)
          : true

  const filteredDomains = domains.filter(d => {
    const textMatch = !q || d.domain.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
    return textMatch && statusMatch(d)
  })

  // Error state
  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
            <div className="flex items-center gap-2 text-destructive">
              <CircleXmark width="16" height="16" />
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
    <div className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto px-2">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SidebarToggleButton />
              <div>
                <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
                  Domains
                </h2>
                <p className="text-muted-foreground text-sm font-medium">
                  {domainsResponse?.pagination.total || 0} domains
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="default" asChild>
                <Link href="/add">
                  <CirclePlus width="12" height="12" className="mr-1" />
                  Add Domain
                </Link>
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => refetchDomains()}
                disabled={isLoading}
              >
                <Refresh2 width="14" height="14" className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="">
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
              </SelectContent>
            </Select>

            {/* Clear button moved below to prevent layout shift */}
          </div>
          {(searchQuery || statusFilter !== 'all') && (
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({ search: null, status: null })
                }}
                className="h-8"
              >
                <Filter2 width="14" height="14" className="mr-2" />
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Domains List - styled container to match Figma */}
      <div className="max-w-5xl mx-auto p-2 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading domains...</div>
          </div>
        ) : !filteredDomains.length ? (
          <div className="max-w-5xl mx-auto">
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
          <div className="border border-border rounded-[13px] bg-card">
            {filteredDomains.map((domain) => (
              <Link
                key={domain.id}
                href={`/emails/${domain.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors cursor-pointer hover:bg-muted/50"
              >
                {/* Domain Icon with Status */}
                <div className="flex-shrink-0">
                  <div className="relative p-[8px] rounded-md bg-muted">
                    <Globe2 width="23" height="23" className="text-[#735ACF]" />
                    <div className="absolute -top-1 -right-1">{getDomainStatusDot(domain)}</div>
                  </div>
                </div>

                {/* Domain Name */}
                <div className="flex-shrink-0 w-100 flex flex-col gap-[2px]">
                  <div className="flex items-center gap-2">

                    <span className="text-sm font-medium">{domain.domain}</span>
                    <Badge
                      variant={domain.status === 'verified' && domain.canReceiveEmails ? 'default' :
                        domain.status === 'verified' ? 'secondary' : 'destructive'}
                    >
                      {getDomainStatusText(domain)}
                    </Badge>
                  </div>

                  <ApiIdLabel id={domain.id} size="sm" />

                  <div className="flex items-center gap-2">
                    <Envelope2 width="14" height="12" className="text-muted-foreground -mr-[4px]" />
                    <span className="text-xs opacity-60">{domain.stats.totalEmailAddresses} email{domain.stats.totalEmailAddresses !== 1 ? 's' : ''}</span>
                    <span className="text-xs opacity-60">·</span>
                    <span className="text-xs opacity-60">{domain.isCatchAllEnabled ? 'Catch-all' : 'Individual'}</span>
                  </div>
                </div>


                {/* Created */}
                <div className="flex-shrink-0 text-xs text-muted-foreground w-20 text-right ml-auto">
                  {format(new Date(domain.createdAt), 'MMM d')}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
