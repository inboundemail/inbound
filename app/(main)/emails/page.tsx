"use client"

import { useState, useEffect } from 'react'
import { getDomainStats } from '@/app/actions/primary'
import { getDomainDetails } from '@/app/actions/domains'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/copy-button'
import { HiCheckCircle, HiChevronDown, HiClipboard, HiCog, HiGlobeAlt, HiLightningBolt, HiMail, HiPlus, HiRefresh, HiX } from 'react-icons/hi'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { formatDistanceToNow } from 'date-fns'
import { DOMAIN_STATUS } from '@/lib/db/schema'
import Link from 'next/link'

interface ProcessedDomain {
  domain: any
  details: any
}

export default function EmailsPage() {
  const [domainStats, setDomainStats] = useState<any>(null)
  const [allDomainsWithDetails, setAllDomainsWithDetails] = useState<ProcessedDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({})
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch domain stats
      const domainStatsResult = await getDomainStats()
      
             if ('error' in domainStatsResult) {
         setError(domainStatsResult.error || 'Unknown error occurred')
         return
       }

      setDomainStats(domainStatsResult)
      
      // Fetch detailed information for all domains to show email addresses
      const domainsWithDetails = await Promise.allSettled(
        domainStatsResult.domains.map(async (domain: any) => {
          // Only fetch details for verified domains that might have email addresses
          if (domain.isVerified && domain.emailAddressCount > 0) {
            const detailsResult = await getDomainDetails(domain.domain, domain.id)
            return {
              domain,
              details: 'success' in detailsResult && detailsResult.success ? detailsResult : null
            }
          }
          return {
            domain,
            details: null
          }
        })
      )

      const processedDomains = domainsWithDetails
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value)

      setAllDomainsWithDetails(processedDomains)
      
      // Auto-expand domains with email addresses
      const autoExpanded: Record<string, boolean> = {}
      processedDomains.forEach(({ domain, details }) => {
        if (details?.emailAddresses && details.emailAddresses.length > 0) {
          autoExpanded[domain.id] = true
        }
      })
      setExpandedDomains(autoExpanded)
      
    } catch (err) {
      setError('Failed to load domain data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

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

  const getDomainIconColor = (domain: any) => {
    if (domain.isVerified) {
      return '#059669' // green-600 - verified
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return '#eab308' // yellow-500 - pending DNS check
      case DOMAIN_STATUS.VERIFIED:
        return '#2563eb' // blue-600 - SES setup
      case DOMAIN_STATUS.FAILED:
        return '#dc2626' // red-600 - failed
      default:
        return '#64748b' // slate-500 - unknown
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
    if (isActive && isConfigured) {
      return "border-l-emerald-500"
    } else if (isActive) {
      return "border-l-amber-500" 
    } else {
      return "border-l-red-500"
    }
  }

  const getEmailStatus = (email: any) => {
    if (email.isActive && email.isReceiptRuleConfigured) {
      return "active"
    } else if (email.isActive) {
      return "pending"
    } else {
      return "inactive"
    }
  }

  const getReadyStatus = (email: any) => {
    if (email.isReceiptRuleConfigured) {
      return "ready"
    } else if (email.isActive) {
      return "processing"
    } else {
      return "error"
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-500">Loading domains...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <HiX className="h-4 w-4" />
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={fetchData} className="ml-auto text-red-600 hover:text-red-700">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!domainStats) return null

  const totalActiveEmails = allDomainsWithDetails.reduce(
    (sum: number, item: any) => sum + (item.details?.emailAddresses?.filter((e: any) => e.isActive).length || 0), 0
  )
  const totalConfiguredEmails = allDomainsWithDetails.reduce(
    (sum: number, item: any) => sum + (item.details?.emailAddresses?.filter((e: any) => e.isReceiptRuleConfigured).length || 0), 0
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
      <div className="max-w-5xl mx-auto">
        {/* Compact Header */}
        <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold mb-1">Email Management</h1>
            <div className="flex items-center gap-4 text-sm text-slate-300">
              <span>{domainStats.verifiedDomains}/{domainStats.totalDomains} domains verified</span>
              <span>{totalActiveEmails} active addresses</span>
              <span className="flex items-center gap-1">
                <HiLightningBolt className="h-3 w-3" />
                {totalConfiguredEmails} configured
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              <HiRefresh className="h-3 w-3 mr-1" />
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/add">
                <HiPlus className="h-3 w-3 mr-1" />
                Add Domain
              </Link>
            </Button>
          </div>
        </div>

        {/* Domain and Email Management */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-1 tracking-tight">
            Domains & Email Addresses ({domainStats.totalDomains})
          </h2>
          <p className="text-gray-600 text-sm font-medium">Manage your email domains and addresses</p>
        </div>

        <div className="space-y-4">
          {allDomainsWithDetails.length === 0 ? (
            <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl">
              <CardContent className="p-8">
                                 <div className="text-center">
                   <CustomInboundIcon 
                     Icon={HiGlobeAlt} 
                     size={48} 
                     backgroundColor="#8b5cf6" 
                     className="mx-auto mb-4" 
                   />
                  <p className="text-sm text-slate-500 mb-4">No domains configured</p>
                  <Button variant="secondary" asChild>
                    <Link href="/add">
                      <HiPlus className="h-4 w-4 mr-2" />
                      Add Your First Domain
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            allDomainsWithDetails.map(({ domain, details }: { domain: any, details: any }) => (
              <Card
                key={domain.id}
                className="bg-white/95 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-200/60 rounded-xl overflow-hidden group"
              >
                <CardContent className="p-0">
                  {/* Domain Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50/80 transition-colors duration-200 border-b border-gray-100/80"
                    onClick={() => toggleDomain(domain.id)}
                  >
                    <div className="flex items-center justify-between">
                                             <div className="flex items-center space-x-3">
                         <CustomInboundIcon 
                           Icon={HiGlobeAlt} 
                           size={36} 
                           backgroundColor={getDomainIconColor(domain)} 
                         />
                        <div>
                          <h3 className="text-base font-semibold text-gray-900 tracking-tight">{domain.domain}</h3>
                          <div className="flex items-center space-x-3 mt-0.5">
                            <span className="text-xs text-gray-600 font-medium">
                              {domain.emailAddressCount} address{domain.emailAddressCount !== 1 ? "es" : ""}
                            </span>
                            <span className="text-xs text-gray-600 font-medium">
                              {domain.emailsLast24h || 0} emails today
                            </span>
                            <span className="text-xs text-gray-500">
                              Added {formatDistanceToNow(new Date(domain.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {domain.isVerified && (
                          <Badge className="bg-emerald-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                            <HiCheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          asChild
                        >
                          <Link href={`/emails/${domain.id}`}>
                            <HiCog className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                          </Link>
                        </Button>
                        {details?.emailAddresses && details.emailAddresses.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleDomain(domain.id)
                            }}
                          >
                            <HiChevronDown 
                              className={`w-4 h-4 text-gray-500 transition-transform duration-300 ease-in-out ${
                                expandedDomains[domain.id] ? 'rotate-0' : '-rotate-90'
                              }`}
                            />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Email Addresses - Smooth expansion */}
                  {details?.emailAddresses && details.emailAddresses.length > 0 && (
                    <div 
                      className="bg-gray-50/30 overflow-hidden transition-all duration-300 ease-in-out"
                      style={{
                        maxHeight: expandedDomains[domain.id] ? `${details.emailAddresses.length * 80 + 16}px` : '0px',
                        opacity: expandedDomains[domain.id] ? 1 : 0
                      }}
                    >
                      {details.emailAddresses.map((email: any, index: number) => (
                        <div
                          key={email.id}
                          className={`group/email relative px-4 py-3 hover:bg-white/60 transition-colors duration-200 border-l-3 ${getBorderColor(email.isActive, email.isReceiptRuleConfigured)} ${
                            index !== details.emailAddresses.length - 1 ? "border-b border-gray-100/60" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                                                         <div className="flex items-center space-x-3 flex-1">
                               <CustomInboundIcon 
                                 Icon={HiMail} 
                                 size={28} 
                                 backgroundColor="#10b981" 
                               />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="text-sm font-medium text-gray-900 truncate">{email.address}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="opacity-0 group-hover/email:opacity-100 transition-all duration-200 p-1 h-auto hover:bg-gray-100 rounded hover:scale-105 active:scale-95"
                                    onClick={() => copyEmail(email.address)}
                                  >
                                    {copiedEmail === email.address ? (
                                      <HiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <HiClipboard className="w-3.5 h-3.5 text-gray-400 transition-all duration-150 hover:text-gray-600" />
                                    )}
                                  </Button>
                                </div>
                                <div className="flex items-center space-x-3 text-xs">
                                  <div className="flex items-center space-x-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(getEmailStatus(email))}`} />
                                    <span className="text-gray-600 font-medium capitalize">{getEmailStatus(email)}</span>
                                  </div>
                                  <span className="text-gray-500">{email.emailsLast24h || 0} emails today</span>
                                  {email.webhookName && (
                                    <div className="flex items-center space-x-1">
                                      <HiLightningBolt className="w-3 h-3 text-amber-500" />
                                      <span className="text-gray-500">{email.webhookName}</span>
                                    </div>
                                  )}
                                  <span className="text-gray-400">
                                    Added {formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(getReadyStatus(email))}`} />
                                <span className="text-xs text-gray-600 font-medium capitalize">{getReadyStatus(email)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
} 