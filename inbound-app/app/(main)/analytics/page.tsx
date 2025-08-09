import { Suspense } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SummaryHeader } from './_components/summary-header'
import { PerformanceMetricsCard } from './_components/performance-metrics-card'
import { DomainPerformanceCard } from './_components/domain-performance-card'
import { ErrorAnalysisCard } from './_components/error-analysis-card'
import { EmailLogsCard } from './_components/email-logs-card'

export default async function AnalyticsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Suspense fallback={<Card className="border-border"><CardContent className="p-6"><div className="h-8 w-64 bg-muted animate-pulse rounded" /></CardContent></Card>}>
        <SummaryHeader />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<Card className="bg-card border-border"><CardHeader className="pb-3"><CardTitle className="text-base">Performance Analysis</CardTitle></CardHeader><CardContent><div className="h-24 bg-muted animate-pulse rounded" /></CardContent></Card>}>
          <PerformanceMetricsCard />
        </Suspense>

        <Suspense fallback={<Card className="bg-card border-border"><CardHeader className="pb-3"><CardTitle className="text-base">Error Analysis</CardTitle></CardHeader><CardContent><div className="h-32 bg-muted animate-pulse rounded" /></CardContent></Card>}>
          <ErrorAnalysisCard />
        </Suspense>
      </div>

      <Suspense fallback={<Card className="bg-card border-border"><CardHeader className="pb-3"><CardTitle className="text-base">Domain Performance</CardTitle></CardHeader><CardContent><div className="h-32 bg-muted animate-pulse rounded" /></CardContent></Card>}>
        <DomainPerformanceCard />
      </Suspense>

      <Suspense fallback={<Card className="bg-card border-border"><CardHeader className="pb-3"><CardTitle className="text-base">Email Processing Logs</CardTitle></CardHeader><CardContent><div className="space-y-2">{Array.from({length:6}).map((_,i)=>(<div key={i} className="h-12 bg-muted animate-pulse rounded" />))}</div></CardContent></Card>}>
        <EmailLogsCard />
      </Suspense>
    </div>
  )
}