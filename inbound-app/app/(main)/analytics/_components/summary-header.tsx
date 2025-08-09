import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Database2 from '@/components/icons/database-2'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import ShieldCheck from '@/components/icons/shield-check'
import Clock2 from '@/components/icons/clock-2'
import Refresh2 from '@/components/icons/refresh-2'
import File2 from '@/components/icons/file-2'
import ObjRemove from '@/components/icons/obj-remove'
import { getAnalyticsStats, getRecentEmails } from '@/app/actions/analytics'

export async function SummaryHeader() {
  const [statsRes, recentRes] = await Promise.all([
    getAnalyticsStats(),
    getRecentEmails({ limit: 200, days: 7 })
  ])

  if (!statsRes.success || !recentRes.success) {
    const statsError = (!statsRes.success && 'error' in statsRes) ? statsRes.error : undefined
    const recentError = (!recentRes.success && 'error' in recentRes) ? recentRes.error : undefined
    const error = statsError ?? recentError ?? 'Failed to load summary'
    return (
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-destructive">
          <ObjRemove width="16" height="16" />
          <span>{error}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/analytics">
              <Refresh2 width="12" height="12" className="mr-1" />
              Try Again
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const stats = statsRes.data
  const recentEmails = recentRes.data.recentEmails

  const securityAnalysis = {
    spfFailures: recentEmails.filter(e => e.authResults.spf === 'FAIL').length,
    dkimFailures: recentEmails.filter(e => e.authResults.dkim === 'FAIL').length,
  }
  const errorAnalysis = {
    totalErrors: recentEmails.filter(e => (
      e.authResults.spf === 'FAIL' ||
      e.authResults.dkim === 'FAIL' ||
      e.authResults.spam === 'FAIL' ||
      e.authResults.virus === 'FAIL'
    )).length
  }

  return (
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
            {stats.avgProcessingTime}ms avg processing
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" asChild>
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
  )
}


