import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import { getRecentEmails } from '@/app/actions/analytics'

export async function ErrorAnalysisCard() {
  const recentRes = await getRecentEmails({ limit: 200, days: 7 })
  if (!recentRes.success) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Error Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Failed to load error analysis.</div>
        </CardContent>
      </Card>
    )
  }

  const recentEmails = recentRes.data.recentEmails
  const errorAnalysis = {
    totalErrors: recentEmails.filter(e => (
      e.authResults.spf === 'FAIL' ||
      e.authResults.dkim === 'FAIL' ||
      e.authResults.spam === 'FAIL' ||
      e.authResults.virus === 'FAIL'
    )).length,
    authErrors: recentEmails.filter(e => (
      e.authResults.spf === 'FAIL' || e.authResults.dkim === 'FAIL'
    )).length,
    spamErrors: recentEmails.filter(e => e.authResults.spam === 'FAIL').length,
    virusErrors: recentEmails.filter(e => e.authResults.virus === 'FAIL').length,
  }

  return (
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
  )
}


