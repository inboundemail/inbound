import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Clock2 from '@/components/icons/clock-2'
import Globe2 from '@/components/icons/globe-2'
import { getAnalyticsStats, getRecentEmails } from '@/app/actions/analytics'

export async function PerformanceMetricsCard() {
  const [statsRes, recentRes] = await Promise.all([
    getAnalyticsStats(),
    getRecentEmails({ limit: 200, days: 7 })
  ])
  if (!statsRes.success || !recentRes.success) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Performance Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Failed to load performance metrics.</div>
        </CardContent>
      </Card>
    )
  }

  const stats = statsRes.data
  const recentEmails = recentRes.data.recentEmails

  const slowEmails = recentEmails.filter(e => e.contentSize && e.contentSize > 1000000)

  // Domain performance based on recentEmails aggregation
  const domainStats = recentEmails.reduce((acc, email) => {
    const domain = email.domain
    if (!acc[domain]) {
      acc[domain] = { total: 0, failed: 0, avgSize: 0, contentSizes: [] as number[] }
    }
    acc[domain].total++
    if (email.authResults.spf === 'FAIL' || email.authResults.dkim === 'FAIL') {
      acc[domain].failed++
    }
    if (email.contentSize) acc[domain].contentSizes.push(email.contentSize)
    return acc
  }, {} as Record<string, { total: number; failed: number; avgSize: number; contentSizes: number[] }>)

  Object.keys(domainStats).forEach(domain => {
    const sizes = domainStats[domain].contentSizes
    domainStats[domain].avgSize = sizes.length > 0 
      ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)
      : 0
  })

  return (
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
              <div className="text-lg font-semibold text-blue-500">{stats.avgProcessingTime}ms</div>
              <div className="text-xs text-blue-500/80">Avg Processing Time</div>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="text-lg font-semibold text-amber-500">{slowEmails.length}</div>
              <div className="text-xs text-amber-500/80">Large Emails (&gt;1MB)</div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">Domain Performance</h4>
            <div className="space-y-2">
              {Object.entries(domainStats)
                .sort(([, a], [, b]) => (b as any).total - (a as any).total)
                .slice(0, 5)
                .map(([domain, s]) => (
                  <div key={domain} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <div className="flex items-center gap-2">
                      <Globe2 width="12" height="12" className="text-muted-foreground" />
                      <span className="text-sm font-mono text-foreground">{domain}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{(s as any).total} emails</span>
                      <span className="text-muted-foreground">{Math.round((s as any).avgSize / 1024)}KB avg</span>
                      {(s as any).failed > 0 && (
                        <span className="text-destructive">{(s as any).failed} failed</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


