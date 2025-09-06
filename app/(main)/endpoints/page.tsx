"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useEndpointsQuery, useMigrationMutation, useUpdateEndpointMutation } from '@/features/endpoints/hooks'
import { CreateEndpointDialog, EditEndpointDialog, DeleteEndpointDialog, TestEndpointDialog } from '@/components/endpoints'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import CircleCheck from '@/components/icons/circle-check'
import ObjRemove from '@/components/icons/obj-remove'
import CirclePlus from '@/components/icons/circle-plus'
import Refresh2 from '@/components/icons/refresh-2'
import BoltLightning from '@/components/icons/bolt-lightning'
import Envelope from '@/components/icons/envelope'
import Users6 from '@/components/icons/users-6'
import Globe2 from '@/components/icons/globe-2'
import CirclePlay from '@/components/icons/circle-play'
import Gear2 from '@/components/icons/gear-2'
import Trash2 from '@/components/icons/trash-2'
import Magnifier2 from '@/components/icons/magnifier-2'
import Filter2 from '@/components/icons/filter-2'
import ChatBubble2 from '@/components/icons/chat-bubble-2'
import BadgeCheck2 from '@/components/icons/badge-check-2'
import Ban2 from '@/components/icons/ban-2'
// import { CustomInboundIcon } from '@/components/icons/customInbound'
// import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { EndpointWithStats } from '@/features/endpoints/types'
import { ApiIdLabel } from '@/components/api-id-label'

type FilterType = 'all' | 'webhook' | 'email' | 'email_group'
type FilterStatus = 'all' | 'active' | 'disabled'
type SortBy = 'newest' | 'oldest'

export default function EndpointsPage() {
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [sortBy, setSortBy] = useState<SortBy>('newest')

  const { data: endpoints = [], isLoading, error, refetch, migrationInProgress, migrationChecked } = useEndpointsQuery(sortBy)
  const migrationMutation = useMigrationMutation()
  const updateMutation = useUpdateEndpointMutation()
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [showMigrationSuccess, setShowMigrationSuccess] = useState(false)

  // Selection state removed in new design

  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointWithStats | null>(null)

  // Show migration success when automatic migration completes
  useEffect(() => {
    if (migrationChecked && !migrationInProgress && endpoints.length > 0) {
      // Check if any endpoints have the migration description
      const hasMigratedEndpoints = endpoints.some(endpoint =>
        endpoint.description?.includes('Migrated from webhook:')
      )
      if (hasMigratedEndpoints) {
        setShowMigrationSuccess(true)
        // Auto-hide after 10 seconds
        setTimeout(() => setShowMigrationSuccess(false), 10000)
      }
    }
  }, [migrationChecked, migrationInProgress, endpoints])

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteMultipleDialogOpen, setDeleteMultipleDialogOpen] = useState(false)
  const [testDialogOpen, setTestDialogOpen] = useState(false)

  // Memoize getConfigSummary to prevent recreations
  const getConfigSummary = useMemo(() => {
    return (endpoint: EndpointWithStats) => {
      if (!endpoint.config) return null

      try {
        const config = JSON.parse(endpoint.config)

        switch (endpoint.type) {
          case 'webhook':
            return new URL(config.url).hostname
          case 'email':
            return config.forwardTo
          case 'email_group':
            return `${config.emails?.length || 0} recipients`
          default:
            return null
        }
      } catch {
        return null
      }
    }
  }, [])

  // Filter and search endpoints
  const filteredEndpoints = useMemo(() => {
    return endpoints.filter(endpoint => {
      // Search filter
      const configSummary = getConfigSummary(endpoint)
      let searchableContent = [
        endpoint.name,
        endpoint.description || '',
        configSummary || ''
      ]

      // Add config-specific searchable content
      if (endpoint.config) {
        try {
          // Check if config is already parsed (from API) or still a string
          const config = typeof endpoint.config === 'string' 
            ? JSON.parse(endpoint.config)
            : endpoint.config
          
          switch (endpoint.type) {
            case 'webhook':
              // Add full URL for webhook endpoints
              if (config.url) {
                searchableContent.push(config.url)
              }
              break
            case 'email':
              // Add forward-to email address
              if (config.forwardTo) {
                searchableContent.push(config.forwardTo)
              }
              break
            case 'email_group':
              // Add all email addresses in the group - check both config.emails and groupEmails
              if (config.emails && Array.isArray(config.emails)) {
                searchableContent.push(...config.emails)
              }
              // Also check if groupEmails is available from API response
              if (endpoint.groupEmails && Array.isArray(endpoint.groupEmails)) {
                searchableContent.push(...endpoint.groupEmails)
              }
              break
          }
        } catch {
          // If config parsing fails, continue with basic search
        }
      }

      const searchMatch = searchQuery === '' ||
        searchableContent.some(content => 
          content.toLowerCase().includes(searchQuery.toLowerCase())
        )

      // Type filter
      const typeMatch = filterType === 'all' || endpoint.type === filterType

      // Status filter
      const statusMatch = filterStatus === 'all' ||
        (filterStatus === 'active' && endpoint.isActive) ||
        (filterStatus === 'disabled' && !endpoint.isActive)

      return searchMatch && typeMatch && statusMatch
    })
  }, [endpoints, searchQuery, filterType, filterStatus, getConfigSummary])

  // removed bulk selection & clipboard interactions for simplified UI

  const handleTestEndpoint = (endpoint: EndpointWithStats) => {
    setSelectedEndpoint(endpoint)
    setTestDialogOpen(true)
  }

  const handleEditEndpoint = (endpoint: EndpointWithStats) => {
    setSelectedEndpoint(endpoint)
    setEditDialogOpen(true)
  }

  const handleDeleteEndpoint = (endpoint: EndpointWithStats) => {
    setSelectedEndpoint(endpoint)
    setDeleteDialogOpen(true)
  }

  // bulk handlers removed

  const getStatusBadge = (endpoint: EndpointWithStats) => (
    <Badge variant={endpoint.isActive ? 'default' : 'secondary'} className="rounded-md">
      {endpoint.isActive ? 'Active' : 'Inactive'}
    </Badge>
  )

  const getEndpointStatusDot = (endpoint: EndpointWithStats) => {
    return endpoint.isActive
      ? <div className="w-2 h-2 rounded-full bg-green-500" />
      : <div className="w-2 h-2 rounded-full bg-red-500" />
  }

  const getTypeSpec = (endpoint: EndpointWithStats) => {
    switch (endpoint.type) {
      case 'email':
        return { Icon: Envelope, bg: 'rgba(128, 97, 255, 0.13)' } //  #8061FF @ 13%
      case 'webhook':
        return { Icon: BoltLightning, bg: 'rgba(43, 102, 235, 0.60)' } // #2B66EB @ 8%
      case 'email_group':
        return { Icon: Users6, bg: 'rgba(34, 163, 77, 0.60)' } // #22A34D @ 8%
      default:
        return { Icon: Globe2, bg: 'rgba(120,120,120,0.60)' }
    }
  }

  

  

  const getEndpointIconColor = (endpoint: EndpointWithStats) => {
    if (!endpoint.isActive) return 'hsl(var(--muted-foreground))'

    switch (endpoint.type) {
      case 'webhook':
        return 'hsl(262, 83%, 58%)'
      case 'email':
        return 'hsl(221, 83%, 53%)'
      case 'email_group':
        return 'hsl(142, 76%, 36%)'
      default:
        return 'hsl(var(--muted-foreground))'
    }
  }



  const totalEndpoints = endpoints.length
  const activeEndpoints = endpoints.filter(e => e.isActive).length
  const webhookCount = endpoints.filter(e => e.type === 'webhook').length
  const emailCount = endpoints.filter(e => e.type === 'email').length
  const emailGroupCount = endpoints.filter(e => e.type === 'email_group').length

  // legacy selection array removed in new design

  if (isLoading || migrationInProgress) {
    return (
      <div className="min-h-screen p-4 font-outfit">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-muted-foreground mb-2">
                {migrationInProgress ? 'Migrating webhooks to endpoints...' : 'Loading endpoints...'}
              </div>
              {migrationInProgress && (
                <div className="text-sm text-blue-600">
                  We're automatically importing your existing webhooks into the new endpoints system
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen p-4 font-outfit">
        <div className="max-w-6xl mx-auto">
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-destructive">
                <ObjRemove width="16" height="16" />
                <span>{error.message}</span>
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto text-destructive hover:text-destructive/80">
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen p-4 font-outfit">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between rounded-lg mb-6 mt-4">
            <div>
              <h1 className="text-2xl font-semibold mb-1">Endpoint Management</h1>
              <div className="flex items-center gap-4 text-sm">
                <span>{totalEndpoints} endpoints</span>
                <span>{activeEndpoints} active</span>
                {webhookCount > 0 && (
                  <span className="flex items-center gap-1">
                    <BoltLightning width="12" height="12" />
                    {webhookCount} webhooks
                  </span>
                )}
                {emailCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Envelope width="12" height="12" />
                    {emailCount} email forwards
                  </span>
                )}
                {emailGroupCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Users6 width="12" height="12" />
                    {emailGroupCount} email groups
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="default"
                onClick={() => refetch()}
                disabled={isLoading}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                <Refresh2 width="12" height="12" className="mr-1" />
                Refresh
              </Button>
              <Button size="default" onClick={() => setCreateDialogOpen(true)}>
                <CirclePlus width="12" height="12" className="mr-1" />
                Add Endpoint
              </Button>
            </div>
          </div>

          <div className="mb-2">
            {/* Search and Filter Controls */}
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <div className="relative flex-1 min-w-[200px]">
                <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search endpoints, URLs, or emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 rounded-xl"
                />
              </div>

              <Select value={filterType} onValueChange={(value: FilterType) => setFilterType(value)}>
                <SelectTrigger className="w-[140px] h-9 rounded-xl">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="webhook">Webhooks</SelectItem>
                  <SelectItem value="email">Email Forwards</SelectItem>
                  <SelectItem value="email_group">Email Groups</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={(value: FilterStatus) => setFilterStatus(value)}>
                <SelectTrigger className="w-[140px] h-9 rounded-xl">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(value: SortBy) => setSortBy(value)}>
                <SelectTrigger className="w-[140px] h-9 rounded-xl">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                </SelectContent>
              </Select>

              {(searchQuery || filterType !== 'all' || filterStatus !== 'all' || sortBy !== 'newest') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setFilterType('all')
                    setFilterStatus('all')
                    setSortBy('newest')
                  }}
                  className="h-9"
                >
                  <Filter2 width="14" height="14" className="mr-2" />
                  Clear
                </Button>
              )}
            </div>

            {/* Bulk selection removed per new design */}
          </div>

          <div className="space-y-2">
            {/* Migration Success Banner */}
            {showMigrationSuccess && (
              <Card className="bg-green-500/10 border-green-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <CircleCheck width="20" height="20" className="text-green-500" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-green-500">Migration Completed Successfully!</h4>
                      <p className="text-sm text-green-500/80">Your webhooks have been imported as endpoints. You can now manage all your endpoints in one place.</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMigrationSuccess(false)}
                      className="text-green-500 hover:text-green-500/80"
                    >
                      <ObjRemove width="16" height="16" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {filteredEndpoints.length === 0 ? (
              <Card className="bg-card border-border rounded-xl">
                <CardContent className="p-8">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex items-center justify-center rounded-[12px]" style={{ width: 48, height: 48, background: 'rgba(120,120,120,0.13)' }}>
                      {(searchQuery || filterType !== 'all' || filterStatus !== 'all') ? (
                        <Magnifier2 width={22} height={22} />
                      ) : (
                        <Globe2 width={22} height={22} />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {searchQuery || filterType !== 'all' || filterStatus !== 'all'
                        ? 'No endpoints match your search criteria'
                        : 'No endpoints configured'
                      }
                    </p>
                    <div className="space-y-2">
                      {searchQuery || filterType !== 'all' || filterStatus !== 'all' ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSearchQuery('')
                            setFilterType('all')
                            setFilterStatus('all')
                            setSortBy('newest')
                          }}
                        >
                          Clear Filters
                        </Button>
                      ) : (
                        <>
                          <Button variant="secondary" onClick={() => setCreateDialogOpen(true)}>
                            <CirclePlus width="16" height="16" className="mr-2" />
                            Add Your First Endpoint
                          </Button>
                          {migrationChecked && !migrationInProgress && (
                            <div className="text-xs text-muted-foreground">
                              <p>Have existing webhooks?
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const result = await migrationMutation.mutateAsync()
                                      if (result.success) {
                                        if ((result.migratedCount || 0) > 0) {
                                          setShowMigrationSuccess(true)
                                          toast.success(`Successfully imported ${result.migratedCount} webhooks!`)
                                        } else {
                                          toast.info('No webhooks found to import')
                                        }
                                      } else {
                                        toast.error(result.error || 'Failed to import webhooks')
                                      }
                                    } catch (error) {
                                      console.error('Migration failed:', error)
                                      toast.error('Failed to import webhooks')
                                    }
                                  }}
                                  disabled={migrationMutation.isPending}
                                  className="p-0 h-auto ml-1 text-primary hover:text-primary/80"
                                >
                                  {migrationMutation.isPending ? 'Importing...' : 'Import them now'}
                                </Button>
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="border border-border rounded-[13px] bg-card">
                {filteredEndpoints.map((endpoint: EndpointWithStats) => {
                  const { Icon } = getTypeSpec(endpoint)
                  const configSummary = getConfigSummary(endpoint)
                  return (
                    <div
                      key={endpoint.id}
                      className="flex items-center gap-4 px-5 py-4 transition-colors cursor-pointer hover:bg-muted/50"
                    >
                      {/* Endpoint Icon with Status */}
                      <div className="flex-shrink-0">
                        <div className="relative p-[8px] rounded-md bg-muted">
                          <Icon width="23" height="23" className="text-[#735ACF]" />
                          <div className="absolute -top-1 -right-1">{getEndpointStatusDot(endpoint)}</div>
                        </div>
                      </div>

                      {/* Endpoint Name and Details */}
                      <div className="flex-shrink-0 w-64 flex flex-col gap-[2px]">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{endpoint.name}</span>
                          {getStatusBadge(endpoint)}
                        </div>
                        <ApiIdLabel id={endpoint.id} size="sm" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs opacity-60">{configSummary || (endpoint.type === 'email_group' ? 'Email group' : endpoint.type.charAt(0).toUpperCase() + endpoint.type.slice(1))}</span>
                        </div>
                      </div>

                      {/* Created Date */}
                      <div className="flex-shrink-0 text-xs text-muted-foreground w-20 text-right ml-auto">
                        {endpoint.createdAt ? format(new Date(endpoint.createdAt as any), 'MMM d') : ''}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 ml-4">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => updateMutation.mutate({ id: endpoint.id, data: { isActive: !endpoint.isActive } })} title={endpoint.isActive ? 'Disable' : 'Enable'}>
                          {endpoint.isActive ? <BadgeCheck2 width="16" height="16" /> : <Ban2 width="16" height="16" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleTestEndpoint(endpoint)} title="Test">
                          <CirclePlay width="16" height="16" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDeleteEndpoint(endpoint)} title="Delete">
                          <Trash2 width="16" height="16" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEditEndpoint(endpoint)} title="Settings">
                          <Gear2 width="16" height="16" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateEndpointDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <EditEndpointDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        endpoint={selectedEndpoint}
      />

      <DeleteEndpointDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        endpoint={selectedEndpoint}
      />

      <TestEndpointDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        endpoint={selectedEndpoint}
      />
    </>
  )
} 