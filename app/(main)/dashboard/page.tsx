import { getAnalytics } from '@/app/actions/analytics'
import { getDomainStats } from '@/app/actions/primary'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Envelope2 from "@/components/icons/envelope-2"
import ChartTrendUp from "@/components/icons/chart-trend-up"
import Globe2 from "@/components/icons/globe-2"
import CircleCheck from "@/components/icons/circle-check"
import ObjRemove from "@/components/icons/obj-remove"
import Clock2 from "@/components/icons/clock-2"
import Refresh2 from "@/components/icons/refresh-2"
import CirclePlus from "@/components/icons/circle-plus"
import CircleWarning2 from "@/components/icons/circle-warning-2"
import ChartActivity2 from "@/components/icons/chart-activity-2"
import Server2 from "@/components/icons/server-2"
import Database2 from "@/components/icons/database-2"
import BoltLightning from "@/components/icons/bolt-lightning"
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
          <CircleCheck width="12" height="12" className="mr-1" />
          Active
        </Badge>
      )
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return (
          <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
            <Clock2 width="12" height="12" className="mr-1" />
            DNS Check
          </Badge>
        )
      case DOMAIN_STATUS.VERIFIED:
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
            <Server2 width="12" height="12" className="mr-1" />
            SES Setup
          </Badge>
        )
      case DOMAIN_STATUS.FAILED:
        return (
          <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 text-xs">
            <ObjRemove width="12" height="12" className="mr-1" />
            Error
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200 text-xs">
            <Clock2 width="12" height="12" className="mr-1" />
            {domain.status}
          </Badge>
        )
    }
  }

  const getEmailStatusBadge = (status: string) => {
    const statusConfig = {
      received: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Database2 },
      processing: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: BoltLightning },
      forwarded: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: CircleCheck },
      failed: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: ObjRemove },
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || {
      bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: Clock2
    }
    
    const Icon = config.icon
    
    return (
      <Badge variant="secondary" className={`${config.bg} ${config.text} ${config.border} text-xs`}>
        <Icon width="12" height="12" className="mr-1" />
        {status}
      </Badge>
    )
  }

  // Get domains and emails for display
  const displayDomains = domainStats?.domains || []
  const displayEmails = analyticsData?.recentEmails?.slice(0, 8) || []

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4">
        <div>
          <h1 className="text-xl font-semibold mb-1">Dashboard</h1>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span className="flex items-center gap-1">
              <ChartActivity2 width="12" height="12" />
              {analyticsData?.stats.totalEmails || 0} emails processed
            </span>
            <span className="flex items-center gap-1">
              <Globe2 width="12" height="12" />
              {domainStats?.verifiedDomains || 0}/{domainStats?.totalDomains || 0} domains active
            </span>
            <span className="flex items-center gap-1">
              <BoltLightning width="12" height="12" />
              {analyticsData?.stats.emailsLast24h || 0} today
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
              <Refresh2 width="12" height="12" className="mr-1" />
              Refresh
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/add">
              <CirclePlus width="12" height="12" className="mr-1" />
              Add Domain
            </Link>
          </Button>
        </div>
      </div>

      {/* Error State */}
      {(analyticsError || domainsError) && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <ObjRemove width="16" height="16" />
              <span>
                {analyticsError && domainsError ? 'Failed to load dashboard data' :
                 analyticsError ? 'Failed to load analytics data' :
                 'Failed to load domain data'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="ml-auto text-destructive hover:text-destructive h-auto p-1"
              >
                <Link href="/dashboard">Retry</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Activity Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-foreground">
            <ChartActivity2 width="16" height="16" className="text-muted-foreground" />
            Email Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <div className="text-2xl font-bold text-blue-400">{analyticsData?.stats.totalEmails || 0}</div>
              <div className="text-sm text-blue-300 mt-1">Total Emails</div>
              <div className="text-xs text-muted-foreground mt-1">All time processed</div>
            </div>
            <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
              <div className="text-2xl font-bold text-green-400">{analyticsData?.stats.emailsLast24h || 0}</div>
              <div className="text-sm text-green-300 mt-1">Today</div>
              <div className="text-xs text-muted-foreground mt-1">Last 24 hours</div>
            </div>
          </div>
          
          {analyticsData?.stats.avgProcessingTime && (
            <div className="mt-4 p-3 bg-accent/5 rounded-lg flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Average Processing Time</span>
              <span className="text-sm text-muted-foreground font-mono">{analyticsData.stats.avgProcessingTime}ms</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain Status & Recent Activity - Two Column */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Domain Status */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-foreground">
                <Globe2 width="16" height="16" className="text-muted-foreground" />
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
                <Globe2 width="24" height="24" className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-2">No domains configured</p>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/add">
                    <CirclePlus width="12" height="12" className="mr-1" />
                    Add Domain
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {displayDomains.slice(0, 6).map((domain) => (
                  <Link 
                    key={domain.id}
                    href={`/emails/${domain.id}`}
                    className="flex items-center justify-between py-3 -mx-6 px-6 hover:bg-accent/5 transition-colors block"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="flex items-center justify-center w-6 h-6 rounded bg-accent/10">
                        <Globe2 width="12" height="12" className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-xs truncate text-foreground">{domain.domain}</div>
                        <div className="text-xs text-muted-foreground">
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
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-foreground">
                <Envelope2 width="16" height="16" className="text-muted-foreground" />
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
                <Envelope2 width="24" height="24" className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayEmails.map((email) => (
                  <Link 
                    key={email.id}
                    href={`/analytics?emailid=${email.id}`}
                    className="flex items-start gap-2 p-2 hover:bg-accent/5 transition-colors border border-border rounded block"
                  >
                    <div className="w-1 h-8 bg-primary/60 rounded-full mt-1 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-xs truncate text-foreground">{email.from}</div>
                        {getEmailStatusBadge(email.status)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mb-0.5">
                        → {email.recipient}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mb-1">
                        {email.subject}
                      </div>
                      <div className="text-xs text-muted-foreground/70">
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