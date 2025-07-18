"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/copy-button'
import CircleCheck from '@/components/icons/circle-check'
import ChevronDown from '@/components/icons/chevron-down'
import Clipboard2 from '@/components/icons/clipboard-2'
import Gear2 from '@/components/icons/gear-2'
import Globe2 from '@/components/icons/globe-2'
import BoltLightning from '@/components/icons/bolt-lightning'
import Envelope2 from '@/components/icons/envelope-2'
import CirclePlus from '@/components/icons/circle-plus'
import Refresh2 from '@/components/icons/refresh-2'
import ObjRemove from '@/components/icons/obj-remove'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { formatDistanceToNow } from 'date-fns'
import { DOMAIN_STATUS } from '@/lib/db/schema'
import Link from 'next/link'
import { useDomainsListV2Query, useDomainDetailsV2Query } from '@/features/domains/hooks/useDomainV2Hooks'
import type { DomainWithStats } from '@/app/api/v2/domains/route'

export default function EmailsPage() {
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({})
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

  // Fetch domain stats using v2 API
  const {
    data: domainsResponse,
    isLoading: isDomainStatsLoading,
    error: domainStatsError,
    refetch: refetchDomainStats
  } = useDomainsListV2Query()

  // Simple helper functions
  const toggleDomain = (domainId: string) => {
    setExpandedDomains(prev => ({
      ...prev,
      [domainId]: !prev[domainId]
    }))
  }

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      setCopiedEmail(email)
      setTimeout(() => setCopiedEmail(null), 2000)
    } catch (err) {
      console.error("Failed to copy email:", err)
    }
  }

  const getDomainIconColor = (domain: DomainWithStats) => {
    if (domain.status === 'verified' && domain.canReceiveEmails) return '#059669' // green-600 - verified

    switch (domain.status) {
      case 'pending': return '#eab308' // yellow-500 - pending DNS check
      case 'verified': return '#2563eb' // blue-600 - SES setup
      case 'failed': return '#dc2626' // red-600 - failed
      default: return '#64748b' // slate-500 - unknown
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
      case "verified":
      case "ready":
        return "bg-emerald-500"
      case "pending":
      case "processing":
        return "bg-amber-500"
      case "inactive":
      case "error":
        return "bg-red-500"
      default:
        return "bg-gray-400"
    }
  }

  const getBorderColor = (isActive: boolean, isConfigured: boolean) => {
    if (isActive && isConfigured) return "border-l-emerald-500"
    if (isActive) return "border-l-amber-500"
    return "border-l-red-500"
  }

  const getEmailStatus = (email: any) => {
    if (email.isActive && email.isReceiptRuleConfigured) return "active"
    if (email.isActive) return "pending"
    return "inactive"
  }

  const getReadyStatus = (email: any) => {
    if (email.isReceiptRuleConfigured) return "ready"
    if (email.isActive) return "processing"
    return "error"
  }

  const getConnectionStatus = (email: any) => {
    // If email has an endpoint or webhook, show connection status
    if (email.endpointId || email.webhookId) {
      if (email.endpointName && email.endpointType) {
        return `Connected to ${email.endpointName} (${email.endpointType})`
      } else if (email.webhookName) {
        return `Connected to ${email.webhookName}`
      } else {
        return "Connected to endpoint"
      }
    }
    // If email is configured but no endpoint/webhook, it's just storing
    if (email.isReceiptRuleConfigured) {
      return "Ready to receive"
    }
    // Otherwise it's not configured yet
    return "Not configured"
  }

  const getConnectionStatusColor = (email: any) => {
    // If email has an endpoint or webhook, show as connected (green)
    if (email.endpointId || email.webhookId) {
      return "bg-emerald-500"
    }
    // If email is configured but no endpoint/webhook, show as ready (blue)
    if (email.isReceiptRuleConfigured) {
      return "bg-blue-500"
    }
    // Otherwise it's not configured yet (red)
    return "bg-red-500"
  }

  // Loading state
  if (isDomainStatsLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading domains...</div>
        </div>
      </div>
    )
  }

  // Error state
  if (domainStatsError) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
                          <div className="flex items-center gap-2 text-destructive">
                <ObjRemove width="16" height="16" />
                <span>{domainStatsError?.message || 'Failed to load domain data'}</span>
              <Button variant="ghost" size="sm" onClick={() => refetchDomainStats()} className="ml-auto text-destructive hover:text-destructive">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!domainsResponse) return null

  const domains = domainsResponse.data || []
  const totalDomains = domainsResponse.meta?.totalCount || 0

  return (
    <div className="min-h-screen p-4 font-outfit">
      <div className="max-w-5xl mx-auto">

        {/* Domain and Email Management */}
        <div className="mb-6 flex items-center justify-between mt-8">
          <div className="">
            <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
              Domains & Email Addresses ({totalDomains})
            </h2>
            <p className="text-muted-foreground text-sm font-medium">Manage your email domains and addresses</p></div>

          <div className="flex items-center gap-2">
            <Button size="sm" asChild>
              <Link href="/add">
                <CirclePlus width="12" height="12" className="mr-1" />
                Add Domain
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetchDomainStats()}
              disabled={isDomainStatsLoading}
            >
              <Refresh2 width="12" height="12" className="mr-1" />
              Refresh
            </Button>

          </div>

        </div>


        <div className="space-y-2 mb-6">
          {domains.length === 0 ? (
            <Card className="bg-card border-border rounded-xl">
              <CardContent className="p-8">
                <div className="text-center">
                  <CustomInboundIcon
                    Icon={Globe2}
                    size={48}
                    backgroundColor="#8b5cf6"
                    className="mx-auto mb-4"
                  />
                  <p className="text-sm text-muted-foreground mb-4">No domains configured</p>
                  <Button variant="secondary" asChild>
                    <Link href="/add">
                      <CirclePlus width="16" height="16" className="mr-2" />
                      Add Your First Domain
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            domains.map((domain) => (
              <DomainCard
                key={domain.id}
                domain={domain}
                isExpanded={expandedDomains[domain.id]}
                onToggle={() => toggleDomain(domain.id)}
                onCopyEmail={copyEmail}
                copiedEmail={copiedEmail}
                getDomainIconColor={getDomainIconColor}
                getStatusColor={getStatusColor}
                getBorderColor={getBorderColor}
                getEmailStatus={getEmailStatus}
                getReadyStatus={getReadyStatus}
                getConnectionStatus={getConnectionStatus}
                getConnectionStatusColor={getConnectionStatusColor}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Separate component for domain cards
function DomainCard({
  domain,
  isExpanded,
  onToggle,
  onCopyEmail,
  copiedEmail,
  getDomainIconColor,
  getStatusColor,
  getBorderColor,
  getEmailStatus,
  getReadyStatus,
  getConnectionStatus,
  getConnectionStatusColor,
}: {
  domain: DomainWithStats
  isExpanded: boolean
  onToggle: () => void
  onCopyEmail: (email: string) => void
  copiedEmail: string | null
  getDomainIconColor: (domain: DomainWithStats) => string
  getStatusColor: (status: string) => string
  getBorderColor: (isActive: boolean, isConfigured: boolean) => string
  getEmailStatus: (email: any) => string
  getReadyStatus: (email: any) => string
  getConnectionStatus: (email: any) => string
  getConnectionStatusColor: (email: any) => string
}) {
  // Only fetch details if domain has email addresses and we need to show them
  // Don't fetch details for catch-all domains as they don't show individual addresses
  const shouldFetchDetails = domain.status === 'verified' && domain.stats.totalEmailAddresses > 0 && !domain.isCatchAllEnabled
  const { data: domainDetails } = useDomainDetailsV2Query(shouldFetchDetails ? domain.id : '')

  // For now, we'll handle email addresses display differently with v2 API
  const emailAddresses: any[] = []

  return (
    <Card className="bg-card border-border hover:bg-accent/5 transition-all duration-300 rounded-xl overflow-hidden group">
      <CardContent className="p-0">
        {/* Domain Header */}
        <div
          className="p-4 cursor-pointer hover:bg-accent/10 transition-colors duration-200 border-b border-border"
          onClick={onToggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CustomInboundIcon
                Icon={Globe2}
                size={36}
                backgroundColor={getDomainIconColor(domain)}
              />
              <div>
                <h3 className="text-base font-semibold text-foreground tracking-tight">{domain.domain}</h3>
                <div className="flex items-center space-x-2 mt-0.5">
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${domain.status === 'verified' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {domain.status === 'verified' ? "Verified" : "Pending DNS"}
                    </span>
                  </div>
                  {domain.isCatchAllEnabled && (
                    <>
                      <span className="text-xs text-muted-foreground font-medium">•</span>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-xs text-muted-foreground font-medium">Catch-all</span>
                      </div>
                    </>
                  )}
                  {!domain.isCatchAllEnabled && (
                    <>
                      <span className="text-xs text-muted-foreground font-medium">•</span>
                      <span className="text-xs text-muted-foreground font-medium">
                        {domain.stats.totalEmailAddresses} address{domain.stats.totalEmailAddresses !== 1 ? "es" : ""}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
                        <div className="flex items-center space-x-2">

              {/* {!domain.isCatchAllEnabled && 
                // <Button 
                //   size="sm" 
                //   onClick={(e) => {
                //     e.stopPropagation()
                //     // TODO: Navigate to add email address page/dialog
                //   }}
                // >
                //   <HiPlus className="w-3 h-3 mr-1" />
                //   Add Address
                // </Button>
              } */}
              <Button 
                variant="secondary" 
                size="sm"
                onClick={(e) => e.stopPropagation()}
                asChild
              >
                <Link href={`/emails/${domain.id}`}>
                  <Gear2 width="12" height="12" className="mr-1" />
                  Config
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Email Addresses - Smooth expansion */}
        {emailAddresses.length > 0 && !domain.isCatchAllEnabled && (
          <div
            className="bg-muted/50 overflow-hidden transition-all duration-300 ease-in-out"
            style={{
              maxHeight: isExpanded ? `${emailAddresses.length * 80 + 16}px` : '0px',
              opacity: isExpanded ? 1 : 0
            }}
          >
            {emailAddresses.map((email: any, index: number) => (
              <div
                key={email.id}
                className={`group/email relative px-4 py-2 hover:bg-muted/80 transition-colors duration-200 border-l-3 ${getBorderColor(email.isActive, email.isReceiptRuleConfigured)} ${index !== emailAddresses.length - 1 ? "border-b border-border" : ""
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <CustomInboundIcon
                      Icon={Envelope2}
                      size={28}
                      backgroundColor="#10b981"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{email.address}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover/email:opacity-100 transition-all duration-200 p-1 h-auto hover:bg-accent rounded hover:scale-105 active:scale-95"
                          onClick={() => onCopyEmail(email.address)}
                        >
                          {copiedEmail === email.address ? (
                            <CircleCheck width="14" height="14" className="text-emerald-500" />
                          ) : (
                            <Clipboard2 width="14" height="14" className="text-muted-foreground transition-all duration-150 hover:text-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-right text-sm ">
                    <span className="text-muted-foreground">{email.emailsLast24h || 0} emails today</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
} 