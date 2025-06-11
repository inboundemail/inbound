"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDomainsStatsQuery } from '@/features/domains/hooks/useDomainsQuery'
import { useAnalyticsQuery } from '@/features/analytics/hooks/useAnalyticsQuery'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { Skeleton } from "@/components/ui/skeleton"
import { 
  MailIcon, 
  TrendingUpIcon, 
  GlobeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  PlusIcon
} from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { DOMAIN_STATUS } from '@/lib/db/schema'

export default function Page() {
  const router = useRouter()
  
  // Use react-query hooks for data fetching
  const { 
    data: domainStats, 
    isLoading: isLoadingDomains, 
    error: domainsError, 
    refetch: refetchDomains,
    isRefetching: isRefetchingDomains 
  } = useDomainsStatsQuery()
  
  const { 
    data: analyticsData, 
    isLoading: isLoadingAnalytics, 
    error: analyticsError, 
    refetch: refetchAnalytics,
    isRefetching: isRefetchingAnalytics 
  } = useAnalyticsQuery()

  // Combined loading and error states
  const isLoading = isLoadingDomains || isLoadingAnalytics
  const isRefetching = isRefetchingDomains || isRefetchingAnalytics
  const error = domainsError || analyticsError

  // Handle refetch errors with toast
  useEffect(() => {
    if (domainsError) {
      toast.error('Failed to load domain data')
    }
    if (analyticsError) {
      toast.error('Failed to load analytics data')
    }
  }, [domainsError, analyticsError])

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchDomains(), refetchAnalytics()])
    } catch (error) {
      toast.error('Failed to refresh data')
    }
  }

  const getStatusBadge = (domain: NonNullable<typeof domainStats>['domains'][0]) => {
    if (domain.isVerified) {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      )
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case DOMAIN_STATUS.VERIFIED:
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            SES Pending
          </Badge>
        )

      case DOMAIN_STATUS.FAILED:
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 transition-colors">
            <XCircleIcon className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            {domain.status}
          </Badge>
        )
    }
  }

  const getEmailStatusBadge = (status: string) => {
    switch (status) {
      case 'received':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
            <CheckCircleIcon className="h-3 w-3 mr-1" />
            Received
          </Badge>
        )
      case 'processing':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            Processing
          </Badge>
        )
      case 'forwarded':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors">
            <TrendingUpIcon className="h-3 w-3 mr-1" />
            Forwarded
          </Badge>
        )
      case 'failed':
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 transition-colors">
            <XCircleIcon className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        )
    }
  }

  const handleDomainClick = (domainId: string) => {
    router.push(`/emails/${domainId}`)
  }

  const handleEmailClick = (emailId: string) => {
    router.push(`/analytics?emailid=${emailId}`)
  }

  // Get domains and emails for display
  const displayDomains = domainStats?.domains || []
  const displayEmails = analyticsData?.recentEmails?.slice(0, 5) || []

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header with Gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Dashboard</h1>
              <p className="text-purple-100 text-lg">
                Overview of your email domains and activity
              </p>
              {isLoading ? (
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white/50 rounded-full animate-pulse"></div>
                    <Skeleton className="h-4 w-24 bg-white/20" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white/50 rounded-full animate-pulse"></div>
                    <Skeleton className="h-4 w-32 bg-white/20" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white/50 rounded-full animate-pulse"></div>
                    <Skeleton className="h-4 w-20 bg-white/20" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-purple-100">{analyticsData?.stats.totalEmails || 0} Total Emails</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-300 rounded-full"></div>
                    <span className="text-purple-100">{domainStats?.verifiedDomains || 0} Verified Domains</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                    <span className="text-purple-100">{analyticsData?.stats.emailsLast24h || 0} Last 24h</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleRefresh}
                disabled={isLoading || isRefetching}
                className="bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
              >
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading || isRefetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button asChild className="bg-white text-purple-700 hover:bg-white/90 font-semibold shadow-lg">
                <a href="/add">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Domain
                </a>
              </Button>
            </div>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
        <div className="absolute top-1/2 right-1/4 w-16 h-16 bg-white/5 rounded-full blur-lg"></div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <XCircleIcon className="h-4 w-4" />
              <span>{error?.message || 'Failed to load data'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="ml-auto text-red-600 hover:text-red-700"
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">

        {/* Weekly Volume */}
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 h-[140px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Weekly Volume</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-20 mb-1" />
                <Skeleton className="h-3 w-24" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-blue-900">{analyticsData?.stats.emailsLast7d?.toLocaleString() || 0}</div>
                <p className="text-xs text-blue-600 mt-1">
                  {analyticsData?.stats.emailsLast24h || 0} in last 24h
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Domains */}
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100 h-[140px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Active Domains</CardTitle>
            <GlobeIcon className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-3 w-28" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-green-900">{domainStats?.verifiedDomains || 0}</div>
                <p className="text-xs text-green-600 mt-1">
                  {domainStats?.totalDomains || 0} total configured
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Processing Time */}
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 h-[140px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-700">Avg Processing</CardTitle>
            <ClockIcon className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-900">{analyticsData?.stats.avgProcessingTime || 0}ms</div>
                <p className="text-xs text-amber-600 mt-1">
                  last 30 days average
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Domains Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GlobeIcon className="h-5 w-5 text-purple-600" />
                  Your Domains
                </CardTitle>
                <CardDescription>
                  Manage and monitor your email domains
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <a href="/emails">
                  View All
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-md" />
                      <div>
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : displayDomains.length === 0 ? (
              <div className="text-center py-8">
                <GlobeIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No domains configured yet</p>
                <Button variant="secondary" size="sm" asChild>
                  <a href="/emails">
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Add Your First Domain
                  </a>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {displayDomains.slice(0, 5).map((domain) => (
                  <div 
                    key={domain.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleDomainClick(domain.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-purple-100 border border-purple-200">
                        <GlobeIcon className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{domain.domain}</div>
                        <div className="text-xs text-muted-foreground">
                          {domain.emailAddressCount} addresses • {domain.emailsLast24h} emails today
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(domain)}
                    </div>
                  </div>
                ))}
                {displayDomains.length > 5 && (
                  <div className="text-center pt-2">
                    <Button variant="ghost" size="sm" asChild>
                      <a href="/emails">
                        View {displayDomains.length - 5} more domains
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Email Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MailIcon className="h-5 w-5 text-purple-600" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Latest inbound emails received
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <a href="/analytics">
                  View All
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-start justify-between py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-40 mb-1" />
                      <Skeleton className="h-4 w-48 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayEmails.length === 0 ? (
              <div className="text-center py-8">
                <MailIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No recent emails</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {displayEmails.map((email, index) => (
                  <div 
                    key={email.id}
                    className="py-4 hover:bg-muted/30 cursor-pointer transition-colors -mx-6 px-6"
                    onClick={() => handleEmailClick(email.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-sm truncate">{email.from}</div>
                        {getEmailStatusBadge(email.status)}
                      </div>
                      <div className="text-sm text-muted-foreground truncate mb-1">
                        To: {email.recipient}
                      </div>
                      <div className="text-sm font-medium truncate mb-1">
                        {email.subject}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                ))}
                {analyticsData && analyticsData.recentEmails.length > 5 && (
                  <div className="text-center pt-4">
                    <Button variant="ghost" size="sm" asChild>
                      <a href="/analytics">
                        View {analyticsData.recentEmails.length - 5} more emails
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}