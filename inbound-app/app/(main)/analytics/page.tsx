import { getAnalytics } from '@/app/actions/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow, format, subDays, isAfter } from 'date-fns'
import { Link } from 'next-view-transitions'
import Clock2 from '@/components/icons/clock-2'
import Database2 from '@/components/icons/database-2'
import File2 from '@/components/icons/file-2'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import Eye2 from '@/components/icons/eye-2'
import Filter2 from '@/components/icons/filter-2'
import Globe2 from '@/components/icons/globe-2'
import Refresh2 from '@/components/icons/refresh-2'
import Magnifier2 from '@/components/icons/magnifier-2'
import ShieldCheck from '@/components/icons/shield-check'
import ObjRemove from '@/components/icons/obj-remove'

export default async function AnalyticsPage() {
  // Fetch analytics data server-side
  const analyticsResult = await getAnalytics()
  
  if (!analyticsResult.success) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-destructive">
              <ObjRemove width="16" height="16" />
              <span>{analyticsResult.error}</span>
              <Button variant="ghost" size="sm" asChild className="ml-auto text-destructive hover:text-destructive/80">
                <Link href="/analytics">Try Again</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { stats, recentEmails } = analyticsResult.data

  // Deep analytics calculations
  const last24hEmails = recentEmails.filter(email => 
    isAfter(new Date(email.receivedAt), subDays(new Date(), 1))
  )
  const last7dEmails = recentEmails.filter(email => 
    isAfter(new Date(email.receivedAt), subDays(new Date(), 7))
  )

  // Security analysis
  const securityAnalysis = {
    spfFailures: recentEmails.filter(e => e.authResults.spf === 'FAIL').length,
    dkimFailures: recentEmails.filter(e => e.authResults.dkim === 'FAIL').length,
    dmarcFailures: recentEmails.filter(e => e.authResults.dmarc === 'FAIL').length,
    spamDetected: recentEmails.filter(e => e.authResults.spam === 'FAIL').length,
    virusDetected: recentEmails.filter(e => e.authResults.virus === 'FAIL').length,
  }

  // Performance analysis
  const avgProcessingTime = stats.avgProcessingTime
  const slowEmails = recentEmails.filter(e => e.contentSize && e.contentSize > 1000000) // Large emails over 1MB

  // Error analysis based on auth failures and verdicts
  const errorAnalysis = {
    totalErrors: recentEmails.filter(e => 
      e.authResults.spf === 'FAIL' || 
      e.authResults.dkim === 'FAIL' || 
      e.authResults.spam === 'FAIL' || 
      e.authResults.virus === 'FAIL'
    ).length,
    authErrors: recentEmails.filter(e => 
      e.authResults.spf === 'FAIL' || e.authResults.dkim === 'FAIL'
    ).length,
    spamErrors: recentEmails.filter(e => e.authResults.spam === 'FAIL').length,
    virusErrors: recentEmails.filter(e => e.authResults.virus === 'FAIL').length,
  }

  // Domain patterns
  const domainStats = recentEmails.reduce((acc, email) => {
    const domain = email.domain
    if (!acc[domain]) {
      acc[domain] = { total: 0, failed: 0, avgSize: 0, contentSizes: [] }
    }
    acc[domain].total++
    // Count auth failures as "failed"
    if (email.authResults.spf === 'FAIL' || email.authResults.dkim === 'FAIL') {
      acc[domain].failed++
    }
    if (email.contentSize) acc[domain].contentSizes.push(email.contentSize)
    return acc
  }, {} as Record<string, any>)

  // Calculate average content size per domain
  Object.keys(domainStats).forEach(domain => {
    const sizes = domainStats[domain].contentSizes
    domainStats[domain].avgSize = sizes.length > 0 
      ? Math.round(sizes.reduce((a: number, b: number) => a + b, 0) / sizes.length)
      : 0
  })

  // Sender patterns
  const senderPatterns = recentEmails.reduce((acc, email) => {
    const sender = email.from
    if (!acc[sender]) acc[sender] = 0
    acc[sender]++
    return acc
  }, {} as Record<string, number>)

  const topSenders = Object.entries(senderPatterns)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
        <div>
          <h1 className="text-xl font-semibold mb-1 text-foreground">Email Analytics & Insights</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Database2 width="12" height="12" />
              {recentEmails.length} log entries
            </span>
            <span className="flex items-center gap-1">
              <CircleWarning2 width="12" height="12" />
              {errorAnalysis.totalErrors} errors
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck width="12" height="12" />
              {securityAnalysis.spfFailures + securityAnalysis.dkimFailures} auth failures
            </span>
            <span className="flex items-center gap-1">
              <Clock2 width="12" height="12" />
              {avgProcessingTime}ms avg processing
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            asChild
          >
            <Link href="/analytics">
              <Refresh2 width="12" height="12" className="mr-1" />
              Refresh
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/analytics?export=true">
              <File2 width="12" height="12" className="mr-1" />
              Export Logs
            </Link>
          </Button>
        </div>
      </div>



      {/* Performance Analysis & Error Insights - Two Column */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Performance Analysis */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-foreground">
              <Clock2 width="16" height="16" className="text-blue-500" />
              Performance Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="text-lg font-semibold text-blue-500">{avgProcessingTime}ms</div>
                  <div className="text-xs text-blue-500/80">Avg Processing Time</div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="text-lg font-semibold text-amber-500">{slowEmails.length}</div>
                  <div className="text-xs text-amber-500/80">Large Emails (&gt;1MB)</div>
                </div>
              </div>

              {/* Domain Performance */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Domain Performance</h4>
                <div className="space-y-2">
                  {Object.entries(domainStats)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .slice(0, 5)
                    .map(([domain, stats]: [string, any]) => (
                      <div key={domain} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          <Globe2 width="12" height="12" className="text-muted-foreground" />
                          <span className="text-sm font-mono text-foreground">{domain}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground">{stats.total} emails</span>
                          <span className="text-muted-foreground">{Math.round(stats.avgSize / 1024)}KB avg</span>
                          {stats.failed > 0 && (
                            <span className="text-destructive">{stats.failed} failed</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Analysis */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-foreground">
              <CircleWarning2 width="16" height="16" className="text-destructive" />
              Error Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="text-lg font-semibold text-destructive">{errorAnalysis.totalErrors}</div>
                  <div className="text-xs text-destructive/80">Total Errors</div>
                </div>
                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <div className="text-lg font-semibold text-orange-500">{errorAnalysis.authErrors}</div>
                  <div className="text-xs text-orange-500/80">Auth Errors</div>
                </div>
              </div>

              {/* Error Breakdown */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Error Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm text-foreground">Auth Errors</span>
                    <span className="text-sm text-destructive">{errorAnalysis.authErrors}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm text-foreground">Spam Detected</span>
                    <span className="text-sm text-destructive">{errorAnalysis.spamErrors}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm text-foreground">Virus Detected</span>
                    <span className="text-sm text-destructive">{errorAnalysis.virusErrors}</span>
                  </div>
                </div>
              </div>

              {errorAnalysis.totalErrors > 10 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-500 text-sm font-medium mb-1">
                    <CircleWarning2 width="16" height="16" />
                    High Error Rate Detected
                  </div>
                  <div className="text-sm text-yellow-500/80">
                    Review endpoint configurations and network connectivity
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Email Logs */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-foreground">
              <File2 width="16" height="16" className="text-muted-foreground" />
              Email Processing Logs ({recentEmails.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
                <Filter2 width="12" height="12" className="mr-1" />
                Filter
              </Button>
              <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
                <Magnifier2 width="12" height="12" className="mr-1" />
                Search
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {recentEmails.slice(0, 20).map((email, index) => (
              <div key={email.id} className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground font-mono w-16 flex-shrink-0 mt-0.5">
                      {format(new Date(email.receivedAt), 'HH:mm:ss')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            email.status === 'forwarded' ? 'bg-green-500/20 text-green-500 border-green-500/20' :
                            email.status === 'failed' ? 'bg-destructive/20 text-destructive border-destructive/20' :
                            email.status === 'processing' ? 'bg-amber-500/20 text-amber-500 border-amber-500/20' :
                            'bg-blue-500/20 text-blue-500 border-blue-500/20'
                          }`}>
                          {email.status.toUpperCase()}
                        </Badge>
                        {email.contentSize && (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground border-border text-xs">
                            {Math.round(email.contentSize / 1024)}KB
                          </Badge>
                        )}
                        <div className="flex gap-1">
                          {email.authResults.spf === 'PASS' && (
                            <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/20 text-xs">SPF</Badge>
                          )}
                          {email.authResults.dkim === 'PASS' && (
                            <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/20 text-xs">DKIM</Badge>
                          )}
                          {email.authResults.spf === 'FAIL' && (
                            <Badge variant="secondary" className="bg-destructive/20 text-destructive border-destructive/20 text-xs">SPF✗</Badge>
                          )}
                          {email.authResults.dkim === 'FAIL' && (
                            <Badge variant="secondary" className="bg-destructive/20 text-destructive border-destructive/20 text-xs">DKIM✗</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-foreground mb-1">
                        <span className="font-medium">{email.from}</span> → <span className="font-medium">{email.recipient}</span>
                      </div>
                      <div className="text-sm text-muted-foreground truncate mb-1">{email.subject}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {email.messageId} • {email.domain}
                        {(email.authResults.spf === 'FAIL' || email.authResults.dkim === 'FAIL') && (
                          <span className="text-destructive ml-2">Auth Failed</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Eye2 width="12" height="12" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {recentEmails.length > 20 && (
            <div className="text-center pt-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/analytics?view=all">View All {recentEmails.length} Logs</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 