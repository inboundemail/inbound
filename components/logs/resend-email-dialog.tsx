"use client"

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import Check2 from '@/components/icons/check-2'
import DoubleChevronDown from '@/components/icons/double-chevron-down'
import { Label } from '@/components/ui/label'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import Refresh2 from '@/components/icons/refresh-2'
import Loader from '@/components/icons/loader'
import Webhook from '@/components/icons/webhook'
import Envelope2 from '@/components/icons/envelope-2'
import UserGroup from '@/components/icons/user-group'
import { ResendStatusLog } from './resend-status-log'

interface ResendEmailDialogProps {
  emailId: string
  defaultEndpointId?: string
  deliveries?: Array<{
    id: string
    config?: {
      name: string
      type: string
    }
  }>
}

interface Endpoint {
  id: string
  name: string
  type: 'webhook' | 'email' | 'email_group'
  isActive: boolean
  description?: string | null
}

// Fetch user endpoints
async function fetchEndpoints(): Promise<Endpoint[]> {
  const response = await fetch('/api/v2/endpoints')
  if (!response.ok) {
    throw new Error('Failed to fetch endpoints')
  }
  const result = await response.json()
  return result.data || []
}

// Resend email to specific endpoint
async function resendToEndpoint(emailId: string, endpointId: string) {
  const response = await fetch(`/api/v2/emails/${emailId}/resend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ endpointId }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Network error' }))
    throw new Error(errorData.error || `HTTP ${response.status}`)
  }

  return response.json()
}

function getEndpointIcon(type: string) {
  switch (type) {
    case 'webhook':
      return Webhook
    case 'email':
      return Envelope2
    case 'email_group':
      return UserGroup
    default:
      return Webhook
  }
}

function getEndpointDisplayName(type: string) {
  switch (type) {
    case 'email':
      return 'Email'
    case 'email_group':
      return 'Email Group'
    case 'webhook':
      return 'Webhook'
    default:
      return type
  }
}

export function ResendEmailDialog({ 
  emailId, 
  defaultEndpointId, 
  deliveries = [] 
}: ResendEmailDialogProps) {
  const [open, setOpen] = useState(false)
  const [comboboxOpen, setComboboxOpen] = useState(false)
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('')
  const [isResending, setIsResending] = useState(false)
  const [logs, setLogs] = useState<Array<{ ts: Date; text: string; type: 'info' | 'success' | 'error' }>>([])
  const [lastStatus, setLastStatus] = useState<{
    success: boolean
    message: string
    deliveryId?: string
    timestamp: Date
  } | undefined>()

  // Fetch available endpoints
  const { data: endpoints = [], isLoading: endpointsLoading } = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
    enabled: open, // Only fetch when dialog is open
  })

  // Set default endpoint when dialog opens or endpoints load
  useEffect(() => {
    if (endpoints.length > 0 && !selectedEndpointId) {
      // Try to use the defaultEndpointId first, or fall back to first active endpoint
      const defaultEndpoint = defaultEndpointId 
        ? endpoints.find(e => e.id === defaultEndpointId && e.isActive)
        : null
      
      const fallbackEndpoint = endpoints.find(e => e.isActive)
      
      if (defaultEndpoint) {
        setSelectedEndpointId(defaultEndpoint.id)
      } else if (fallbackEndpoint) {
        setSelectedEndpointId(fallbackEndpoint.id)
      }
    }
  }, [endpoints, defaultEndpointId, selectedEndpointId])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedEndpointId('')
      setIsResending(false)
      setLogs([])
      setLastStatus(undefined)
      setComboboxOpen(false)
    }
  }, [open])

  const appendLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { ts: new Date(), text, type }])
  }

  const handleResend = async () => {
    if (!selectedEndpointId || isResending) return

    const selectedEndpoint = endpoints.find(e => e.id === selectedEndpointId)
    const endpointName = selectedEndpoint?.name || 'Unknown Endpoint'

    setIsResending(true)
    appendLog(`Starting resend to ${endpointName}...`, 'info')
    
    try {
      const result = await resendToEndpoint(emailId, selectedEndpointId)
      
      if (result.success) {
        appendLog(`✓ Successfully resent to ${endpointName}`, 'success')
        setLastStatus({
          success: true,
          message: result.message || 'Email resent successfully',
          deliveryId: result.deliveryId,
          timestamp: new Date()
        })
        toast.success('Email resent successfully')
      } else {
        appendLog(`✗ Failed to resend: ${result.error || 'Unknown error'}`, 'error')
        setLastStatus({
          success: false,
          message: result.error || 'Failed to resend email',
          timestamp: new Date()
        })
        toast.error(result.error || 'Failed to resend email')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to resend email'
      appendLog(`✗ Error: ${errorMessage}`, 'error')
      setLastStatus({
        success: false,
        message: errorMessage,
        timestamp: new Date()
      })
      console.error('Resend error:', error)
      toast.error(errorMessage)
    } finally {
      setIsResending(false)
    }
  }

  const selectedEndpoint = endpoints.find(e => e.id === selectedEndpointId)
  const activeEndpoints = endpoints.filter(e => e.isActive)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5">
          <Refresh2 width="14" height="14" />
          Resend
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-lg font-semibold">Resend Email</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Choose an endpoint to resend this email to. This will create a new delivery attempt.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
            <div className="space-y-3">
            <Label htmlFor="endpoint" className="text-sm font-medium">Destination Endpoint</Label>
            {endpointsLoading ? (
              <div className="flex items-center justify-center h-12 border border-dashed border-border/60 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader width="16" height="16" className="animate-spin" />
                  <span className="text-sm">Loading endpoints...</span>
                </div>
              </div>
            ) : activeEndpoints.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 border border-dashed border-border/60 rounded-lg bg-muted/20 text-center">
                <div className="font-medium mb-1">No Active Endpoints</div>
                <div className="text-xs">Please create and activate an endpoint first.</div>
              </div>
            ) : (
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboboxOpen}
                    className="w-full justify-between"
                  >
                    {selectedEndpointId
                      ? (() => {
                          const endpoint = activeEndpoints.find(e => e.id === selectedEndpointId)
                          const Icon = endpoint ? getEndpointIcon(endpoint.type) : Webhook
                          return (
                            <div className="flex items-center gap-3">
                              <Icon width="16" height="16" className="text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium truncate block">{endpoint?.name}</span>
                                <span className="text-xs text-muted-foreground capitalize">
                                  {endpoint ? getEndpointDisplayName(endpoint.type) : 'Unknown'} endpoint
                                </span>
                              </div>
                            </div>
                          )
                        })()
                      : "Select an endpoint..."
                    }
                    <DoubleChevronDown width="16" height="16" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search endpoints..." />
                    <CommandList>
                      <CommandEmpty>No endpoints found.</CommandEmpty>
                      <CommandGroup>
                        {activeEndpoints.map((endpoint) => {
                          const Icon = getEndpointIcon(endpoint.type)
                          return (
                            <CommandItem
                              key={endpoint.id}
                              value={`${endpoint.name} ${endpoint.type}`}
                              onSelect={() => {
                                setSelectedEndpointId(endpoint.id)
                                setComboboxOpen(false)
                              }}
                              className="px-3 py-2.5"
                            >
                              <Check2
                                width="16"
                                height="16"
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedEndpointId === endpoint.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex items-start gap-3 flex-1">
                                <div className="flex-shrink-0 mt-0.5">
                                  <Icon width="16" height="16" className="text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{endpoint.name}</div>
                                  <div className="text-xs text-muted-foreground capitalize">
                                    {getEndpointDisplayName(endpoint.type)} endpoint
                                  </div>
                                  {endpoint.description && (
                                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{endpoint.description}</div>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
          
          {selectedEndpoint && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {(() => {
                    const Icon = getEndpointIcon(selectedEndpoint.type)
                    return <Icon width="20" height="20" className="text-muted-foreground mt-0.5" />
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{selectedEndpoint.name}</div>
                  <div className="text-xs text-muted-foreground capitalize mt-0.5">
                    {getEndpointDisplayName(selectedEndpoint.type)} endpoint
                  </div>
                  {selectedEndpoint.description && (
                    <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      {selectedEndpoint.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <ResendStatusLog logs={logs} lastStatus={lastStatus} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isResending}>
            Cancel
          </Button>
          <Button 
            onClick={handleResend} 
            disabled={!selectedEndpointId || isResending || activeEndpoints.length === 0}
          >
            {isResending ? (
              <>
                <Loader width="14" height="14" className="mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
