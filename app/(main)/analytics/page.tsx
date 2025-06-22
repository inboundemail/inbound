import { getAnalytics } from '@/app/actions/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow, format, subDays, isAfter } from 'date-fns'
import Link from 'next/link'
import { HiClock, HiDatabase, HiDocumentText, HiExclamationCircle, HiEye, HiFilter, HiGlobeAlt, HiRefresh, HiSearch, HiShieldCheck, HiX,  } from 'react-icons/hi'

export default async function AnalyticsPage() {
  // Fetch analytics data server-side
  const analyticsResult = await getAnalytics()
  
  if (!analyticsResult.success) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <HiX className="h-4 w-4" />
              <span>{analyticsResult.error}</span>
              <Button variant="ghost" size="sm" asChild className="ml-auto text-red-600 hover:text-red-700">
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
      {/* Compact Header */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4">
        <div>
          <h1 className="text-xl font-semibold mb-1">Email Analytics & Insights</h1>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span className="flex items-center gap-1">
              <HiDatabase className="h-3 w-3" />
              {recentEmails.length} log entries
            </span>
            <span className="flex items-center gap-1">
              <HiExclamationCircle className="h-3 w-3" />
              {errorAnalysis.totalErrors} errors
            </span>
            <span className="flex items-center gap-1">
              <HiShieldCheck className="h-3 w-3" />
              {securityAnalysis.spfFailures + securityAnalysis.dkimFailures} auth failures
            </span>
            <span className="flex items-center gap-1">
              <HiClock className="h-3 w-3" />
              {avgProcessingTime}ms avg processing
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
            <Link href="/analytics">
              <HiRefresh className="h-3 w-3 mr-1" />
              Refresh
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/analytics?export=true">
              <HiDocumentText className="h-3 w-3 mr-1" />
              Export Logs
            </Link>
          </Button>
        </div>
      </div>

      {/* Security Analysis */}
      <Card className="border-red-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HiShieldCheck className="h-4 w-4 text-red-600" />
            Security Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-5 gap-3 mb-4">
            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-100">
              <div className="text-lg font-semibold text-red-700">{securityAnalysis.spfFailures}</div>
              <div className="text-xs text-red-600 mt-1">SPF Failures</div>
              <div className="text-xs text-slate-500 mt-1">
                {recentEmails.length > 0 ? Math.round((securityAnalysis.spfFailures / recentEmails.length) * 100) : 0}%
              </div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-100">
              <div className="text-lg font-semibold text-orange-700">{securityAnalysis.dkimFailures}</div>
              <div className="text-xs text-orange-600 mt-1">DKIM Failures</div>
              <div className="text-xs text-slate-500 mt-1">
                {recentEmails.length > 0 ? Math.round((securityAnalysis.dkimFailures / recentEmails.length) * 100) : 0}%
              </div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-100">
              <div className="text-lg font-semibold text-yellow-700">{securityAnalysis.dmarcFailures}</div>
              <div className="text-xs text-yellow-600 mt-1">DMARC Failures</div>
              <div className="text-xs text-slate-500 mt-1">Authentication</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="text-lg font-semibold text-purple-700">{securityAnalysis.spamDetected}</div>
              <div className="text-xs text-purple-600 mt-1">Spam Detected</div>
              <div className="text-xs text-slate-500 mt-1">Content filter</div>
            </div>
            <div className="text-center p-3 bg-pink-50 rounded-lg border border-pink-100">
              <div className="text-lg font-semibold text-pink-700">{securityAnalysis.virusDetected}</div>
              <div className="text-xs text-pink-600 mt-1">Virus Detected</div>
              <div className="text-xs text-slate-500 mt-1">Malware scan</div>
            </div>
          </div>
          
          {(securityAnalysis.spfFailures > 0 || securityAnalysis.dkimFailures > 0 || securityAnalysis.spamDetected > 0) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-2">
                <HiExclamationCircle className="h-4 w-4" />
                Security Recommendations
              </div>
              <div className="text-sm text-red-600 space-y-1">
                {securityAnalysis.spfFailures > 5 && <div>• High SPF failure rate detected - verify sender authentication</div>}
                {securityAnalysis.dkimFailures > 5 && <div>• DKIM signature issues - check domain key configuration</div>}
                {securityAnalysis.spamDetected > 0 && <div>• Spam detected - review content filtering rules</div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Analysis & Error Insights - Two Column */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Performance Analysis */}
        <Card className="border-blue-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HiClock className="h-4 w-4 text-blue-600" />
              Performance Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-lg font-semibold text-blue-700">{avgProcessingTime}ms</div>
                  <div className="text-xs text-blue-600">Avg Processing Time</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="text-lg font-semibold text-amber-700">{slowEmails.length}</div>
                  <div className="text-xs text-amber-600">Slow Emails (over 5s)</div>
                </div>
              </div>

              {/* Domain Performance */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">Domain Performance</h4>
                <div className="space-y-2">
                  {Object.entries(domainStats)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .slice(0, 5)
                    .map(([domain, stats]: [string, any]) => (
                      <div key={domain} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <div className="flex items-center gap-2">
                          <HiGlobeAlt className="h-3 w-3 text-slate-500" />
                          <span className="text-sm font-mono">{domain}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-600">{stats.total} emails</span>
                          <span className="text-slate-600">{Math.round(stats.avgSize / 1024)}KB avg</span>
                          {stats.failed > 0 && (
                            <span className="text-red-600">{stats.failed} failed</span>
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
        <Card className="border-red-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HiExclamationCircle className="h-4 w-4 text-red-600" />
              Error Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                  <div className="text-lg font-semibold text-red-700">{errorAnalysis.totalErrors}</div>
                  <div className="text-xs text-red-600">Total Errors</div>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <div className="text-lg font-semibold text-orange-700">{errorAnalysis.authErrors}</div>
                  <div className="text-xs text-orange-600">Auth Errors</div>
                </div>
              </div>

              {/* Error Breakdown */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">Error Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="text-sm">Auth Errors</span>
                    <span className="text-sm text-red-600">{errorAnalysis.authErrors}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="text-sm">Spam Detected</span>
                    <span className="text-sm text-red-600">{errorAnalysis.spamErrors}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="text-sm">Virus Detected</span>
                    <span className="text-sm text-red-600">{errorAnalysis.virusErrors}</span>
                  </div>
                </div>
              </div>

              {errorAnalysis.totalErrors > 10 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                    <HiExclamationCircle className="h-4 w-4" />
                    High Error Rate Detected
                  </div>
                  <div className="text-sm text-amber-600">
                    Review endpoint configurations and network connectivity
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Email Logs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HiDocumentText className="h-4 w-4" />
              Email Processing Logs ({recentEmails.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
                <HiFilter className="h-3 w-3 mr-1" />
                Filter
              </Button>
              <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
                <HiSearch className="h-3 w-3 mr-1" />
                Search
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {recentEmails.slice(0, 20).map((email, index) => (
              <div key={email.id} className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="text-xs text-slate-400 font-mono w-16 flex-shrink-0 mt-0.5">
                      {format(new Date(email.receivedAt), 'HH:mm:ss')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            email.status === 'forwarded' ? 'bg-green-50 text-green-700 border-green-200' :
                            email.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                            email.status === 'processing' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                          {email.status.toUpperCase()}
                        </Badge>
                         {email.contentSize && (
                           <Badge variant="secondary" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">
                             {Math.round(email.contentSize / 1024)}KB
                           </Badge>
                         )}
                        <div className="flex gap-1">
                          {email.authResults.spf === 'PASS' && (
                            <Badge variant="secondary" className="bg-green-50 text-green-600 border-green-200 text-xs">SPF</Badge>
                          )}
                          {email.authResults.dkim === 'PASS' && (
                            <Badge variant="secondary" className="bg-green-50 text-green-600 border-green-200 text-xs">DKIM</Badge>
                          )}
                          {email.authResults.spf === 'FAIL' && (
                            <Badge variant="secondary" className="bg-red-50 text-red-600 border-red-200 text-xs">SPF✗</Badge>
                          )}
                          {email.authResults.dkim === 'FAIL' && (
                            <Badge variant="secondary" className="bg-red-50 text-red-600 border-red-200 text-xs">DKIM✗</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-slate-900 mb-1">
                        <span className="font-medium">{email.from}</span> → <span className="font-medium">{email.recipient}</span>
                      </div>
                      <div className="text-sm text-slate-600 truncate mb-1">{email.subject}</div>
                                             <div className="text-xs text-slate-500 font-mono">
                         {email.messageId} • {email.domain}
                         {(email.authResults.spf === 'FAIL' || email.authResults.dkim === 'FAIL') && (
                           <span className="text-red-600 ml-2">Auth Failed</span>
                         )}
                       </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <HiEye className="h-3 w-3" />
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