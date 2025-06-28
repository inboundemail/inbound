"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useEndpointsQuery, useMigrationMutation } from '@/features/endpoints/hooks'
import { CreateEndpointDialog, EditEndpointDialog, DeleteEndpointDialog, DeleteMultipleEndpointsDialog, TestEndpointDialog } from '@/components/endpoints'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { HiCheckCircle, HiX, HiPlus, HiRefresh, HiLightningBolt, HiMail, HiUserGroup, HiGlobeAlt, HiPlay, HiCog, HiTrash, HiClipboard, HiDownload, HiSearch, HiFilter } from 'react-icons/hi'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Endpoint } from '@/features/endpoints/types'

type FilterType = 'all' | 'webhook' | 'email' | 'email_group'
type FilterStatus = 'all' | 'active' | 'disabled'

export default function EndpointsPage() {
  const { data: endpoints = [], isLoading, error, refetch, migrationInProgress, migrationChecked } = useEndpointsQuery()
  const migrationMutation = useMigrationMutation()
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [showMigrationSuccess, setShowMigrationSuccess] = useState(false)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')

  // Selection state
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

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

  // Handle select all - simplified to prevent infinite loops
  useEffect(() => {
    if (filteredEndpoints.length === 0 && selectedEndpoints.size > 0) {
      setSelectedEndpoints(new Set())
      setSelectAll(false)
    }
  }, [filteredEndpoints.length, selectedEndpoints.size])

  // Update select all state when selection changes
  const allSelected = useMemo(() => {
    if (filteredEndpoints.length === 0) return false
    return filteredEndpoints.every(endpoint => selectedEndpoints.has(endpoint.id))
  }, [filteredEndpoints, selectedEndpoints])

  useEffect(() => {
    setSelectAll(allSelected)
  }, [allSelected])

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch (err) {
      console.error("Failed to copy URL:", err)
    }
  }

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

  const handleSelectEndpoint = (endpointId: string, checked: boolean) => {
    const newSelected = new Set(selectedEndpoints)
    if (checked) {
      newSelected.add(endpointId)
    } else {
      newSelected.delete(endpointId)
    }
    setSelectedEndpoints(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEndpoints(new Set(filteredEndpoints.map(e => e.id)))
    } else {
      setSelectedEndpoints(new Set())
    }
  }

  const handleDeleteMultiple = () => {
    if (selectedEndpoints.size === 0) {
      toast.error('No endpoints selected')
      return
    }
    setDeleteMultipleDialogOpen(true)
  }

  const clearSelection = () => {
    setSelectedEndpoints(new Set())
    setSelectAll(false)
  }

  const getStatusBadge = (endpoint: Endpoint) => {
    if (endpoint.isActive) {
      return (
        <Badge 
          className="bg-emerald-500 text-white rounded-full px-0.5 py-0.5 text-xs font-medium shadow-sm"
          title="Active"
        >
          <HiCheckCircle className="w-3 h-3" />
        </Badge>
      )
    } else {
      return (
        <Badge 
          className="bg-gray-400 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm"
          title="Not Active"
        >
          <HiX className="w-3 h-3" />
        </Badge>
      )
    }
  }

  const getEndpointIcon = (endpoint: Endpoint) => {
    switch (endpoint.type) {
      case 'webhook':
        return HiLightningBolt
      case 'email':
        return HiMail
      case 'email_group':
        return HiUserGroup
      default:
        return HiGlobeAlt
    }
  }

  const getEndpointTypeLabel = (endpoint: Endpoint) => {
    switch (endpoint.type) {
      case 'webhook':
        return 'Webhook'
      case 'email':
        return 'Email Forward'
      case 'email_group':
        return 'Email Group'
      default:
        return 'Endpoint'
    }
  }

  const getEndpointTypeBadge = (endpoint: Endpoint) => {
    switch (endpoint.type) {
      case 'webhook':
        return (
          <Badge className="bg-purple-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
            Webhook
          </Badge>
        )
      case 'email':
        return (
          <Badge className="bg-blue-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
            Email Forward
          </Badge>
        )
      case 'email_group':
        return (
          <Badge className="bg-green-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
            Email Group
          </Badge>
        )
      default:
        return (
          <Badge className="bg-gray-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
            Endpoint
          </Badge>
        )
    }
  }

  const getEndpointIconColor = (endpoint: Endpoint) => {
    if (!endpoint.isActive) return '#64748b'

    switch (endpoint.type) {
      case 'webhook':
        return '#8b5cf6'
      case 'email':
        return '#3b82f6'
      case 'email_group':
        return '#10b981'
      default:
        return '#6b7280'
    }
  }



  const totalEndpoints = endpoints.length
  const activeEndpoints = endpoints.filter(e => e.isActive).length
  const webhookCount = endpoints.filter(e => e.type === 'webhook').length
  const emailCount = endpoints.filter(e => e.type === 'email').length
  const emailGroupCount = endpoints.filter(e => e.type === 'email_group').length

  const selectedEndpointsArray = endpoints.filter(e => selectedEndpoints.has(e.id))

  if (isLoading || migrationInProgress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-slate-500 mb-2">
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
        <div className="max-w-5xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-red-600">
                <HiX className="h-4 w-4" />
                <span>{error.message}</span>
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto text-red-600 hover:text-red-700">
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4 mb-6">
            <div>
              <h1 className="text-xl font-semibold mb-1">Endpoint Management</h1>
              <div className="flex items-center gap-4 text-sm text-slate-300">
                <span>{totalEndpoints} endpoints</span>
                <span>{activeEndpoints} active</span>
                {webhookCount > 0 && (
                  <span className="flex items-center gap-1">
                    <HiLightningBolt className="h-3 w-3" />
                    {webhookCount} webhooks
                  </span>
                )}
                {emailCount > 0 && (
                  <span className="flex items-center gap-1">
                    <HiMail className="h-3 w-3" />
                    {emailCount} email forwards
                  </span>
                )}
                {emailGroupCount > 0 && (
                  <span className="flex items-center gap-1">
                    <HiUserGroup className="h-3 w-3" />
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
                className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              >
                <HiRefresh className="h-3 w-3 mr-1" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <HiPlus className="h-3 w-3 mr-1" />
                Add Endpoint
              </Button>
            </div>
          </div>

                      <div className="mb-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-1 tracking-tight">
                    Active Endpoints ({filteredEndpoints.length})
                  </h2>
                  <p className="text-gray-600 text-sm font-medium">Manage your webhook and email forwarding endpoints</p>
                </div>
              </div>

                        {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-1 mb-2">
              <div className="flex-1">
                <div className="relative">
                  <HiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search endpoints by name, description, or configuration..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white rounded-xl"
                  />
                </div>
              </div>
              
              <div className="flex gap-1">
                <Select value={filterType} onValueChange={(value: FilterType) => setFilterType(value)}>
                  <SelectTrigger className="w-40 bg-white rounded-xl">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-xl">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="webhook">Webhooks</SelectItem>
                    <SelectItem value="email">Email Forwards</SelectItem>
                    <SelectItem value="email_group">Email Groups</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={(value: FilterStatus) => setFilterStatus(value)}>
                  <SelectTrigger className="w-32 bg-white rounded-xl">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-xl">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bulk Selection Controls */}
            {filteredEndpoints.length > 0 && (
              <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl mb-2">
                <CardContent className="py-2 px-4">
                  <div className="flex items-center justify-between min-h-[32px]">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectAll}
                        onCheckedChange={handleSelectAll}
                        id="select-all"
                      />
                      <label htmlFor="select-all" className="text-sm font-medium text-gray-700 cursor-pointer">
                        {selectedEndpoints.size > 0 
                          ? `${selectedEndpoints.size} of ${filteredEndpoints.length} endpoints selected`
                          : `Select all (${filteredEndpoints.length}) endpoints`
                        }
                      </label>
                    </div>
                    
                    <div className={`flex items-center gap-2 transition-opacity duration-200 ${
                      selectedEndpoints.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={clearSelection}
                        disabled={selectedEndpoints.size === 0}
                      >
                        Clear
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteMultiple}
                        className="bg-red-600 hover:bg-red-700"
                        disabled={selectedEndpoints.size === 0}
                      >
                        <HiTrash className="h-3 w-3 mr-1" />
                        Delete ({selectedEndpoints.size})
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <hr className="my-4 border-gray-200" />

          <div className="space-y-2">
            {/* Migration Success Banner */}
            {showMigrationSuccess && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <HiCheckCircle className="h-5 w-5 text-green-600" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-green-800">Migration Completed Successfully!</h4>
                      <p className="text-sm text-green-700">Your webhooks have been imported as endpoints. You can now manage all your endpoints in one place.</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMigrationSuccess(false)}
                      className="text-green-600 hover:text-green-700"
                    >
                      <HiX className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {filteredEndpoints.length === 0 ? (
              <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl">
                <CardContent className="p-8">
                  <div className="text-center">
                    <CustomInboundIcon
                      Icon={searchQuery || filterType !== 'all' || filterStatus !== 'all' ? HiSearch : HiGlobeAlt}
                      size={48}
                      backgroundColor="#6b7280"
                      className="mx-auto mb-4"
                    />
                    <p className="text-sm text-slate-500 mb-4">
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
                            <HiPlus className="h-4 w-4 mr-2" />
                            Add Your First Endpoint
                          </Button>
                          {migrationChecked && !migrationInProgress && (
                            <div className="text-xs text-gray-500">
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
                                  className="p-0 h-auto ml-1 text-blue-600 hover:text-blue-700"
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
              filteredEndpoints.map((endpoint: Endpoint) => {
                const EndpointIcon = getEndpointIcon(endpoint)
                const configSummary = getConfigSummary(endpoint)
                const isSelected = selectedEndpoints.has(endpoint.id)

                return (
                  <Card
                    key={endpoint.id}
                    className={`bg-white/95 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-300 border rounded-xl group ${isSelected ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200/60'
                      }`}
                  >
                    <CardContent className="p-0">
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectEndpoint(endpoint.id, checked as boolean)}
                              className="flex-shrink-0"
                            />
                            <CustomInboundIcon
                              Icon={EndpointIcon}
                              size={36}
                              backgroundColor={getEndpointIconColor(endpoint)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <h3 className="text-base font-semibold text-gray-900 tracking-tight truncate">{endpoint.name}</h3>
                                {/* {getEndpointTypeBadge(endpoint)} */}
                              </div>
                              {/* <div className="flex items-center space-x-3 text-sm">
                                <div className="flex items-center space-x-2 text-gray-600">
                                  <span className="font-mono truncate">
                                    {configSummary}
                                  </span>
                                  {endpoint.type === 'webhook' && configSummary && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1 h-auto hover:bg-gray-100 rounded hover:scale-105 active:scale-95"
                                      onClick={() => {
                                        try {
                                          const config = JSON.parse(endpoint.config)
                                          copyUrl(config.url)
                                        } catch {}
                                      }}
                                    >
                                      {copiedUrl && endpoint.config && JSON.parse(endpoint.config).url === copiedUrl ? (
                                        <HiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : (
                                        <HiClipboard className="w-3.5 h-3.5 text-gray-400 transition-all duration-150 hover:text-gray-600" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                                {endpoint.description && (
                                  <span className="text-gray-500 text-xs truncate">{endpoint.description}</span>
                                )}
                                <span className="text-gray-400 text-xs">
                                  Added {endpoint.createdAt ? formatDistanceToNow(new Date(endpoint.createdAt), { addSuffix: true }) : 'recently'}
                                </span>
                              </div> */}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(endpoint)}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              onClick={() => handleTestEndpoint(endpoint)}
                              title="Test endpoint"
                            >
                              <HiPlay className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              onClick={() => handleEditEndpoint(endpoint)}
                              title="Configure endpoint"
                            >
                              <HiCog className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              onClick={() => handleDeleteEndpoint(endpoint)}
                              title="Delete endpoint"
                            >
                              <HiTrash className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
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

      <DeleteMultipleEndpointsDialog
        open={deleteMultipleDialogOpen}
        onOpenChange={setDeleteMultipleDialogOpen}
        endpoints={selectedEndpointsArray}
        onSuccess={clearSelection}
      />

      <TestEndpointDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        endpoint={selectedEndpoint}
      />
    </>
  )
} 