"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useEndpointsQuery, useMigrationMutation, useUpdateEndpointMutation } from '@/features/endpoints/hooks'
import { CreateEndpointDialog, EditEndpointDialog, DeleteEndpointDialog, TestEndpointDialog } from '@/components/endpoints'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import ChatBubble2 from '@/components/icons/chat-bubble-2'
import BadgeCheck2 from '@/components/icons/badge-check-2'
import Ban2 from '@/components/icons/ban-2'
// import { CustomInboundIcon } from '@/components/icons/customInbound'
// import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Endpoint } from '@/features/endpoints/types'

type FilterType = 'all' | 'webhook' | 'email' | 'email_group'
type FilterStatus = 'all' | 'active' | 'disabled'

export default function EndpointsPage() {
  const { data: endpoints = [], isLoading, error, refetch, migrationInProgress, migrationChecked } = useEndpointsQuery()
  const migrationMutation = useMigrationMutation()
  const updateMutation = useUpdateEndpointMutation()
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [showMigrationSuccess, setShowMigrationSuccess] = useState(false)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')

  // Selection state removed in new design

  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null)

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
    return (endpoint: Endpoint) => {
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
      const searchMatch = searchQuery === '' ||
        endpoint.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        endpoint.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        configSummary?.toLowerCase().includes(searchQuery.toLowerCase())

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

  const handleTestEndpoint = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint)
    setTestDialogOpen(true)
  }

  const handleEditEndpoint = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint)
    setEditDialogOpen(true)
  }

  const handleDeleteEndpoint = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint)
    setDeleteDialogOpen(true)
  }

  // bulk handlers removed

  const getStatusBadge = (endpoint: Endpoint) => (
    <Badge variant={endpoint.isActive ? 'secondary' : 'destructive'} className="rounded-md">
      {endpoint.isActive ? 'Active' : 'Inactive'}
    </Badge>
  )

  const getTypeSpec = (endpoint: Endpoint) => {
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

  

  

  const getEndpointIconColor = (endpoint: Endpoint) => {
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
        <div className="max-w-5xl mx-auto">
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
        <div className="max-w-5xl mx-auto">
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
        <div className="max-w-5xl mx-auto">
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
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                <Refresh2 width="12" height="12" className="mr-1" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <CirclePlus width="12" height="12" className="mr-1" />
                Add Endpoint
              </Button>
            </div>
          </div>

          <div className="mb-2">
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-1 mb-2">
              <div className="flex-1">
                <div className="relative">
                  <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search endpoints by name, description, or configuration..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-card border-border rounded-xl"
                  />
                </div>
              </div>

              <div className="flex gap-1">
                <Select value={filterType} onValueChange={(value: FilterType) => setFilterType(value)}>
                  <SelectTrigger className="w-40 bg-card border-border rounded-xl">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border rounded-xl">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="webhook">Webhooks</SelectItem>
                    <SelectItem value="email">Email Forwards</SelectItem>
                    <SelectItem value="email_group">Email Groups</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={(value: FilterStatus) => setFilterStatus(value)}>
                  <SelectTrigger className="w-32 bg-card border-border rounded-xl">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border rounded-xl">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bulk selection removed per new design */}
          </div>

          <hr className="my-4 border-border" />

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
              <div className="space-y-2">
                {filteredEndpoints.map((endpoint: Endpoint) => {
                  const { Icon, bg } = getTypeSpec(endpoint)
                  return (
                    <div key={endpoint.id} className="flex items-center justify-between rounded-[13px] border border-border bg-background/60 px-4 py-3 transition-colors hover:bg-accent/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center rounded-[9px]" style={{ width: 36, height: 36, background: bg }}>
                          <Icon width={16} height={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-foreground truncate">{endpoint.name}</span>
                            {getStatusBadge(endpoint)}
                            <ChatBubble2 width="14" height="14" className="opacity-70" />
                            <ChatBubble2 width="14" height="14" className="opacity-40" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
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