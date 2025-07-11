'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Cloud2 from '@/components/icons/cloud-2'
import Gear2 from '@/components/icons/gear-2'

export default function SESPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Cloud2 width="32" height="32" />
            SES Dashboard
          </h1>
          <p className="text-muted-foreground">
            AWS SES monitoring and metrics (Coming Soon)
          </p>
        </div>
      </div>

      {/* Placeholder Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gear2 width="20" height="20" />
            Under Development
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Cloud2 width="64" height="64" className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">SES Dashboard Coming Soon</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              This dashboard will provide comprehensive monitoring of your AWS SES service including:
            </p>
            <ul className="text-sm text-muted-foreground mt-4 space-y-1">
              <li>• Email sending metrics and statistics</li>
              <li>• Bounce and complaint rates</li>
              <li>• Domain verification status</li>
              <li>• SES configuration management</li>
              <li>• Receipt rule monitoring</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 