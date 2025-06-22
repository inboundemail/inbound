import { getAnalytics } from '@/app/actions/analytics'
import { getDomainStats } from '@/app/actions/primary'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { 
  MailIcon, 
  TrendingUpIcon, 
  GlobeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  PlusIcon,
  AlertTriangleIcon,
  ActivityIcon,
  ServerIcon,
  DatabaseIcon,
  ArrowRightIcon,
  ZapIcon
} from "lucide-react"
import { formatDistanceToNow } from 'date-fns'
import { DOMAIN_STATUS } from '@/lib/db/schema'
import Link from 'next/link'

export default async function Page() {
  // Fetch data using server actions
  const [analyticsResult, domainStatsResult] = await Promise.allSettled([
    getAnalytics(),
    getDomainStats()
  ])

  // Handle results and provide fallback data
  const analyticsData = analyticsResult.status === 'fulfilled' && analyticsResult.value.success 
    ? analyticsResult.value.data 
    : null

  const domainStats = domainStatsResult.status === 'fulfilled' && !('error' in domainStatsResult.value)
    ? domainStatsResult.value
    : null

  // Error states
  const analyticsError = analyticsResult.status === 'rejected' || 
    (analyticsResult.status === 'fulfilled' && !analyticsResult.value.success)
  const domainsError = domainStatsResult.status === 'rejected' || 
    (domainStatsResult.status === 'fulfilled' && 'error' in domainStatsResult.value)

  const getStatusBadge = (domain: NonNullable<typeof domainStats>['domains'][0]) => {
    if (domain.isVerified) {
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 text-xs">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          Active
        </Badge>
      )
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return (
          <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
            <ClockIcon className="h-3 w-3 mr-1" />
            DNS Check
          </Badge>
        )
      case DOMAIN_STATUS.VERIFIED:
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
            <ServerIcon className="h-3 w-3 mr-1" />
            SES Setup
          </Badge>
        )
      case DOMAIN_STATUS.FAILED:
        return (
          <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 text-xs">
            <XCircleIcon className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200 text-xs">
            <ClockIcon className="h-3 w-3 mr-1" />
            {domain.status}
          </Badge>
        )
    }
  }

  const getEmailStatusBadge = (status: string) => {
    const statusConfig = {
      received: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: DatabaseIcon },
      processing: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: ZapIcon },
      forwarded: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: CheckCircleIcon },
      failed: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircleIcon },
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || {
      bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: ClockIcon
    }
    
    const Icon = config.icon
    
    return (
      <Badge variant="secondary" className={`${config.bg} ${config.text} ${config.border} text-xs`}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    )
  }

  // Get domains and emails for display
  const displayDomains = domainStats?.domains || []
  const displayEmails = analyticsData?.recentEmails?.slice(0, 8) || []

  // Calculate pipeline metrics
  const pipelineStats = {
    received: analyticsData?.stats.totalEmails || 0,
    processing: displayEmails.filter(e => e.status === 'processing').length,
    forwarded: displayEmails.filter(e => e.status === 'forwarded').length,
    failed: displayEmails.filter(e => e.status === 'failed').length,
  }

  const successRate = pipelineStats.received > 0 
    ? Math.round((pipelineStats.forwarded / pipelineStats.received) * 100) 
    : 0

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4">
        <div>
          <h1 className="text-xl font-semibold mb-1">Email Pipeline Dashboard</h1>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span className="flex items-center gap-1">
              <ActivityIcon className="h-3 w-3" />
              {analyticsData?.stats.totalEmails || 0} processed
            </span>
            <span className="flex items-center gap-1">
              <GlobeIcon className="h-3 w-3" />
              {domainStats?.verifiedDomains || 0}/{domainStats?.totalDomains || 0} domains active
            </span>
            <span className="flex items-center gap-1">
              <ZapIcon className="h-3 w-3" />
              {successRate}% success rate
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            asChild
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <Link href="/dashboard">
              <RefreshCwIcon className="h-3 w-3 mr-1" />
              Refresh
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/add">
              <PlusIcon className="h-3 w-3 mr-1" />
              Add Domain
            </Link>
          </Button>
        </div>
      </div>

      {/* Error State */}
      {(analyticsError || domainsError) && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <XCircleIcon className="h-4 w-4" />
              <span>
                {analyticsError && domainsError ? 'Failed to load dashboard data' :
                 analyticsError ? 'Failed to load analytics data' :
                 'Failed to load domain data'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="ml-auto text-red-600 hover:text-red-700 h-auto p-1"
              >
                <Link href="/dashboard">Retry</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Flow Pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ActivityIcon className="h-4 w-4" />
            Email Processing Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div>
            {/* Pipeline Flow Visualization */}
            <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Receive
                </div>
                <ArrowRightIcon className="h-3 w-3 text-slate-400" />
                <div className="flex items-center gap-2 text-sm font-medium">
                  <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                  Process
                </div>
                <ArrowRightIcon className="h-3 w-3 text-slate-400" />
                <div className="flex items-center gap-2 text-sm font-medium">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Forward
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Avg: {analyticsData?.stats.avgProcessingTime || 0}ms
              </div>
            </div>

            {/* Pipeline Metrics */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="text-lg font-semibold text-blue-700">{pipelineStats.received}</div>
                <div className="text-xs text-blue-600 mt-1">Received</div>
                <div className="text-xs text-slate-500 mt-1">
                  {analyticsData?.stats.emailsLast24h || 0} today
                </div>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-lg font-semibold text-amber-700">{pipelineStats.processing}</div>
                <div className="text-xs text-amber-600 mt-1">Processing</div>
                <div className="text-xs text-slate-500 mt-1">Active queue</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
                <div className="text-lg font-semibold text-green-700">{pipelineStats.forwarded}</div>
                <div className="text-xs text-green-600 mt-1">Forwarded</div>
                <div className="text-xs text-slate-500 mt-1">{successRate}% rate</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg border border-red-100">
                <div className="text-lg font-semibold text-red-700">{pipelineStats.failed}</div>
                <div className="text-xs text-red-600 mt-1">Failed</div>
                <div className="text-xs text-slate-500 mt-1">Need attention</div>
              </div>
            </div>

            {/* Success Rate Progress */}
            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Success Rate</span>
                <span className="text-sm text-slate-600">{successRate}%</span>
              </div>
              <Progress value={successRate} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Domain Status & Recent Activity - Two Column */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Domain Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <GlobeIcon className="h-4 w-4" />
                Domain Status
              </CardTitle>
              <Button variant="ghost" size="sm" asChild className="h-auto p-1 text-xs">
                <Link href="/emails">View All →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {displayDomains.length === 0 ? (
              <div className="text-center py-6">
                <GlobeIcon className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500 mb-2">No domains configured</p>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/add">
                    <PlusIcon className="h-3 w-3 mr-1" />
                    Add Domain
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {displayDomains.slice(0, 6).map((domain) => (
                  <Link 
                    key={domain.id}
                    href={`/emails/${domain.id}`}
                    className="flex items-center justify-between py-3 -mx-6 px-6 hover:bg-slate-50 transition-colors block"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="flex items-center justify-center w-6 h-6 rounded bg-slate-100">
                        <GlobeIcon className="h-3 w-3 text-slate-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-xs truncate">{domain.domain}</div>
                        <div className="text-xs text-slate-500">
                          {domain.emailAddressCount} addresses • {domain.emailsLast24h} today
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(domain)}
                  </Link>
                ))}
                {displayDomains.length > 6 && (
                  <div className="text-center pt-2">
                    <Button variant="ghost" size="sm" asChild className="text-xs">
                      <Link href="/emails">+{displayDomains.length - 6} more</Link>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Stream */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MailIcon className="h-4 w-4" />
                Activity Stream
              </CardTitle>
              <Button variant="ghost" size="sm" asChild className="h-auto p-1 text-xs">
                <Link href="/analytics">View All →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {displayEmails.length === 0 ? (
              <div className="text-center py-6">
                <MailIcon className="h-6 w-6 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayEmails.map((email) => (
                  <Link 
                    key={email.id}
                    href={`/analytics?emailid=${email.id}`}
                    className="flex items-start gap-2 p-2 hover:bg-slate-50 transition-colors border rounded block"
                  >
                    <div className="w-1 h-8 bg-blue-200 rounded-full mt-1 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-xs truncate">{email.from}</div>
                        {getEmailStatusBadge(email.status)}
                      </div>
                      <div className="text-xs text-slate-600 truncate mb-0.5">
                        → {email.recipient}
                      </div>
                      <div className="text-xs text-slate-500 truncate mb-1">
                        {email.subject}
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}