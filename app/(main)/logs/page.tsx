"use client"

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'

// Import Nucleo icons
import Clock2 from '@/components/icons/clock-2'
import Database2 from '@/components/icons/database-2'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import Eye2 from '@/components/icons/eye-2'
import Filter2 from '@/components/icons/filter-2'
import Refresh2 from '@/components/icons/refresh-2'
import Magnifier2 from '@/components/icons/magnifier-2'
import ObjRemove from '@/components/icons/obj-remove'
import CircleCheck from '@/components/icons/circle-check'
import TabClose from '@/components/icons/tab-close'
import CirclePlay from '@/components/icons/circle-play'
import CircleDots from '@/components/icons/circle-dots'
import Hashtag2 from '@/components/icons/hashtag-2'
import ShieldCheck from '@/components/icons/shield-check'
import Ban2 from '@/components/icons/ban-2'
import Copy2 from '@/components/icons/copy-2'
import ArrowUpRight2 from '@/components/icons/arrow-up-right-2'

import { useUserEmailLogsQuery } from '@/features/emails/hooks'
import type { EmailLogsOptions, EmailLogEntry, EmailLogDelivery } from '@/features/emails/types'
import { toast } from 'sonner'

function getStatusIcon(email: EmailLogEntry) {
  const hasDeliveries = email.deliveries.length > 0
  const hasSuccessfulDelivery = email.deliveries.some(d => d.status === 'success')
  const hasFailedDelivery = email.deliveries.some(d => d.status === 'failed')
  const hasPendingDelivery = email.deliveries.some(d => d.status === 'pending')

  if (!email.parseSuccess) {
    return <CircleWarning2 width="14" height="14" className="text-destructive" />
  }

  if (!hasDeliveries) {
    return <CircleDots width="14" height="14" className="text-muted-foreground" />
  }

  if (hasSuccessfulDelivery) {
    return <CircleCheck width="14" height="14" className="text-green-600" />
  }

  if (hasFailedDelivery) {
    return <TabClose width="14" height="14" className="text-destructive" />
  }

  if (hasPendingDelivery) {
    return <CirclePlay width="14" height="14" className="text-yellow-600" />
  }

  return <CircleDots width="14" height="14" className="text-muted-foreground" />
}

function LogDetailSheet({ log, isOpen, onClose }: { log: EmailLogEntry | null, isOpen: boolean, onClose: () => void }) {
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied to clipboard`)
    } catch (err) {
      toast.error('Failed to copy to clipboard')
    }
  }

  if (!log) return null

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[85vh] sm:max-w-none">
        <SheetHeader className="pb-4">
          <SheetTitle>Log Details</SheetTitle>
          <SheetDescription>
            Message ID: {log.messageId}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(85vh-120px)]">
          <div className="space-y-6 pb-6">
            {/* Email Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Email Information</h3>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">From:</span>
                    <p className="font-medium">{log.from}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">To:</span>
                    <p className="font-medium">{log.recipient}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subject:</span>
                    <p className="font-medium">{log.subject}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Received:</span>
                    <p className="font-medium">{format(new Date(log.receivedAt), 'PPpp')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Domain:</span>
                    <p className="font-medium">{log.domain}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Processing Time:</span>
                    <p className="font-medium">{log.processingTimeMs}ms</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Authentication Results */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Authentication Results</h3>
              <div className="flex flex-wrap gap-2">
                <Badge 
                  variant={log.authResults.spf === 'PASS' ? 'default' : 'destructive'}
                  className={log.authResults.spf === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                >
                  {log.authResults.spf === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />}
                  SPF: {log.authResults.spf}
                </Badge>
                <Badge 
                  variant={log.authResults.dkim === 'PASS' ? 'default' : 'destructive'}
                  className={log.authResults.dkim === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                >
                  {log.authResults.dkim === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />}
                  DKIM: {log.authResults.dkim}
                </Badge>
                <Badge 
                  variant={log.authResults.dmarc === 'PASS' ? 'default' : 'destructive'}
                  className={log.authResults.dmarc === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                >
                  {log.authResults.dmarc === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />}
                  DMARC: {log.authResults.dmarc}
                </Badge>
                <Badge 
                  variant={log.authResults.spam === 'PASS' ? 'default' : 'destructive'}
                  className={log.authResults.spam === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                >
                  Spam: {log.authResults.spam}
                </Badge>
                <Badge 
                  variant={log.authResults.virus === 'PASS' ? 'default' : 'destructive'}
                  className={log.authResults.virus === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                >
                  Virus: {log.authResults.virus}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Delivery Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Delivery Information</h3>
              {log.deliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No delivery configured for this email</p>
              ) : (
                <div className="space-y-4">
                  {log.deliveries.map((delivery) => (
                    <div key={delivery.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{delivery.config?.name || 'Unknown Endpoint'}</h4>
                          <p className="text-sm text-muted-foreground">
                            {delivery.type === 'webhook' ? 'Webhook' : 'Email Forward'}
                          </p>
                        </div>
                        <Badge 
                          variant={delivery.status === 'success' ? 'default' : delivery.status === 'failed' ? 'destructive' : 'secondary'}
                          className={
                            delivery.status === 'success' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                            delivery.status === 'failed' ? '' :
                            'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                          }
                        >
                          {delivery.status.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-muted-foreground">Attempts:</span>
                            <p className="font-medium">{delivery.attempts}</p>
                          </div>
                          {delivery.lastAttemptAt && (
                            <div>
                              <span className="text-muted-foreground">Last Attempt:</span>
                              <p className="font-medium">{format(new Date(delivery.lastAttemptAt), 'PPp')}</p>
                            </div>
                          )}
                          {delivery.deliveryTimeMs && (
                            <div>
                              <span className="text-muted-foreground">Delivery Time:</span>
                              <p className="font-medium">{delivery.deliveryTimeMs}ms</p>
                            </div>
                          )}
                          {delivery.responseCode && (
                            <div>
                              <span className="text-muted-foreground">Response Code:</span>
                              <p className="font-medium">{delivery.responseCode}</p>
                            </div>
                          )}
                        </div>

                        {delivery.config?.url && (
                          <div>
                            <span className="text-muted-foreground">URL:</span>
                            <p className="font-medium font-mono text-xs break-all">{delivery.config.url}</p>
                          </div>
                        )}

                        {delivery.error && (
                          <div className="mt-2 p-2 bg-destructive/10 rounded">
                            <span className="text-destructive text-sm font-medium">Error:</span>
                            <p className="text-destructive text-sm mt-1">{delivery.error}</p>
                          </div>
                        )}

                        {delivery.responseData && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-muted-foreground">Response Data:</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(delivery.responseData, null, 2), 'Response data')}
                              >
                                <Copy2 width="12" height="12" />
                              </Button>
                            </div>
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                              {JSON.stringify(delivery.responseData, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/mail/${log.emailId}`}>
                  <Eye2 width="14" height="14" className="mr-2" />
                  View Email
                </Link>
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

export default function LogsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<string>('7d')
  const [selectedLog, setSelectedLog] = useState<EmailLogEntry | null>(null)

  const queryOptions: EmailLogsOptions = {
    searchQuery,
    statusFilter: statusFilter as any,
    domainFilter,
    timeRange: timeRange as any,
    limit: 100,
    offset: 0
  }

  const { data, isLoading, error, refetch } = useUserEmailLogsQuery(queryOptions)

  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
            <div className="flex items-center gap-2 text-destructive">
              <ObjRemove width="16" height="16" />
              <span>{error.message}</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto text-destructive hover:text-destructive/80">
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
                Logs
              </h2>
              <p className="text-muted-foreground text-sm font-medium">
                {data?.stats.totalEmails || 0} total logs found
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <Refresh2 width="14" height="14" className="mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
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
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="no_delivery">No Delivery</SelectItem>
                <SelectItem value="parse_failed">Parse Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[140px] h-9 rounded-xl">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {data?.filters.uniqueDomains.map(domain => (
                  <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px] h-9 rounded-xl">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            {(searchQuery || statusFilter !== 'all' || domainFilter !== 'all' || timeRange !== '7d') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                  setDomainFilter('all')
                  setTimeRange('7d')
                }}
                className="h-9"
              >
                <Filter2 width="14" height="14" className="mr-2" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        {data && (
          <div className="mb-6 bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <CircleCheck width="14" height="14" className="text-green-600" />
                <span className="text-muted-foreground">Delivered:</span>
                <span className="font-medium text-foreground">{data.stats.delivered}</span>
              </div>
              <div className="flex items-center gap-2">
                <TabClose width="14" height="14" className="text-destructive" />
                <span className="text-muted-foreground">Failed:</span>
                <span className="font-medium text-foreground">{data.stats.failed}</span>
              </div>
              <div className="flex items-center gap-2">
                <CirclePlay width="14" height="14" className="text-yellow-600" />
                <span className="text-muted-foreground">Pending:</span>
                <span className="font-medium text-foreground">{data.stats.pending}</span>
              </div>
              <div className="flex items-center gap-2">
                <CircleDots width="14" height="14" className="text-muted-foreground" />
                <span className="text-muted-foreground">No Delivery:</span>
                <span className="font-medium text-foreground">{data.stats.noDelivery}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock2 width="14" height="14" className="text-muted-foreground" />
                <span className="text-muted-foreground">Avg Processing:</span>
                <span className="font-medium text-foreground">{Math.round(data.stats.avgProcessingTime)}ms</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Logs List - Edge to Edge */}
      <div className="w-full max-w-6xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading logs...</div>
          </div>
        ) : !data?.emails.length ? (
          <div className="max-w-6xl mx-auto p-4">
            <div className="bg-card border-border rounded-xl p-8">
              <div className="text-center">
                <Database2 width="48" height="48" className="text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-foreground">No logs found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== 'all' || domainFilter !== 'all' || timeRange !== '7d'
                    ? 'Try adjusting your filters or search query.'
                    : 'Start receiving emails to see logs here.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.emails.map((log) => (
              <div 
                key={log.id}
                className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setSelectedLog(log)}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {getStatusIcon(log)}
                </div>

                {/* Time */}
                <div className="flex-shrink-0 w-20 text-xs font-mono text-muted-foreground">
                  {format(new Date(log.receivedAt), 'HH:mm:ss')}
                </div>

                {/* From */}
                <div className="flex-shrink-0 w-48 truncate">
                  <span className="text-sm font-medium">{log.from}</span>
                </div>

                {/* Subject */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm truncate">{log.subject}</span>
                    {log.hasAttachments && (
                      <Hashtag2 width="14" height="14" className="text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {log.recipient} • {log.domain}
                  </div>
                </div>

                {/* Delivery Info */}
                <div className="flex-shrink-0 text-right">
                  {log.deliveries.length > 0 ? (
                    <div className="text-xs">
                      <div className="font-medium">
                        {log.deliveries[0].config?.name || 'Unknown'}
                      </div>
                      <div className="text-muted-foreground">
                        {log.deliveries[0].responseCode ? `${log.deliveries[0].responseCode}` : 
                         log.deliveries[0].error ? 'Error' : 
                         log.deliveries[0].status}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No delivery</span>
                  )}
                </div>

                {/* Auth badges */}
                <div className="flex-shrink-0 flex gap-1">
                  {log.authResults.spf === 'PASS' && (
                    <Badge variant="outline" className="text-xs px-1 py-0 h-5">SPF</Badge>
                  )}
                  {log.authResults.dkim === 'PASS' && (
                    <Badge variant="outline" className="text-xs px-1 py-0 h-5">DKIM</Badge>
                  )}
                  {log.authResults.spf === 'FAIL' && (
                    <Badge variant="destructive" className="text-xs px-1 py-0 h-5">SPF✗</Badge>
                  )}
                  {log.authResults.dkim === 'FAIL' && (
                    <Badge variant="destructive" className="text-xs px-1 py-0 h-5">DKIM✗</Badge>
                  )}
                </div>

                {/* Processing time */}
                <div className="flex-shrink-0 text-xs text-muted-foreground">
                  {log.processingTimeMs}ms
                </div>

                {/* View button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 flex-shrink-0"
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link href={`/mail/${log.emailId}`}>
                    <ArrowUpRight2 width="12" height="12" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log Detail Sheet */}
      <LogDetailSheet 
        log={selectedLog} 
        isOpen={!!selectedLog} 
        onClose={() => setSelectedLog(null)} 
      />
    </div>
  )
} 