import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Globe2 from '@/components/icons/globe-2'
import { getRecentEmails } from '@/app/actions/analytics'

export async function DomainPerformanceCard() {
  const recentRes = await getRecentEmails({ limit: 500, days: 7 })
  if (!recentRes.success) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Domain Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Failed to load domain performance.</div>
        </CardContent>
      </Card>
    )
  }

  const recentEmails = recentRes.data.recentEmails

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
        <CardTitle className="text-base">Domain Performance</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {Object.entries(domainStats)
            .sort(([, a], [, b]) => (b as any).total - (a as any).total)
            .slice(0, 5)
            .map(([domain, stats]) => (
              <div key={domain} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                <div className="flex items-center gap-2">
                  <Globe2 width="12" height="12" className="text-muted-foreground" />
                  <span className="text-sm font-mono text-foreground">{domain}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{(stats as any).total} emails</span>
                  <span className="text-muted-foreground">{Math.round((stats as any).avgSize / 1024)}KB avg</span>
                  {(stats as any).failed > 0 && (
                    <span className="text-destructive">{(stats as any).failed} failed</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}


