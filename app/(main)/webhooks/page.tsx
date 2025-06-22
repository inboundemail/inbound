import { getWebhooks } from '@/app/actions/webhooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CopyButton } from '@/components/copy-button'
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon, 
  PlusIcon,
  RefreshCwIcon,
  ActivityIcon,
  ZapIcon,
  WebhookIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  CalendarIcon,
  ShieldCheckIcon,
  PlayIcon,
  SettingsIcon,
  TrashIcon,
  BarChart3Icon,
  GlobeIcon,
  MoreHorizontalIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { Webhook } from '@/features/webhooks/types'

export default async function EndpointsPage() {
  // Fetch webhooks data (will expand to fetch all endpoint types)
  const webhooksResult = await getWebhooks()
  
  if ('error' in webhooksResult) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <XCircleIcon className="h-4 w-4" />
              <span>{webhooksResult.error}</span>
              <Button variant="ghost" size="sm" asChild className="ml-auto text-red-600 hover:text-red-700">
                <Link href="/webhooks">Try Again</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const webhooks = webhooksResult.webhooks

  // Helper functions
  const getStatusBadge = (webhook: Webhook) => {
    if (webhook.isActive) {
      const successRate = getSuccessRate(webhook)
      if ((webhook.totalDeliveries || 0) === 0) {
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
            <ZapIcon className="h-3 w-3 mr-1" />
            Ready
          </Badge>
        )
      }
      if (successRate >= 95) {
        return (
          <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 text-xs">
            <CheckCircleIcon className="h-3 w-3 mr-1" />
            Excellent
          </Badge>
        )
      }
      if (successRate >= 80) {
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
            <TrendingUpIcon className="h-3 w-3 mr-1" />
            Good
          </Badge>
        )
      }
      return (
        <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
          <AlertTriangleIcon className="h-3 w-3 mr-1" />
          Needs Attention
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200 text-xs">
          <XCircleIcon className="h-3 w-3 mr-1" />
          Disabled
        </Badge>
      )
    }
  }

  const getSuccessRate = (webhook: Webhook) => {
    if (!webhook.totalDeliveries) return 0
    return Math.round(((webhook.successfulDeliveries || 0) / webhook.totalDeliveries) * 100)
  }

  // Calculate metrics
  const totalEndpoints = webhooks.length
  const activeEndpoints = webhooks.filter(w => w.isActive).length
  const totalDeliveries = webhooks.reduce((sum, w) => sum + (w.totalDeliveries || 0), 0)
  const successfulDeliveries = webhooks.reduce((sum, w) => sum + (w.successfulDeliveries || 0), 0)
  const overallSuccessRate = totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 0

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4">
        <div>
          <h1 className="text-xl font-semibold mb-1">Endpoint Management</h1>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span className="flex items-center gap-1">
              <ZapIcon className="h-3 w-3" />
              {totalEndpoints} endpoints
            </span>
            <span className="flex items-center gap-1">
              <ActivityIcon className="h-3 w-3" />
              {activeEndpoints} active
            </span>
            <span className="flex items-center gap-1">
              <TrendingUpIcon className="h-3 w-3" />
              {overallSuccessRate}% success rate
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
            <Link href="/webhooks">
              <RefreshCwIcon className="h-3 w-3 mr-1" />
              Refresh
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/webhooks?create=true">
              <PlusIcon className="h-3 w-3 mr-1" />
              Add Endpoint
            </Link>
          </Button>
        </div>
      </div>

      {/* Compact Performance Overview */}
      {totalDeliveries > 0 && (
        <div className="flex items-center gap-6 bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <BarChart3Icon className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Performance:</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-slate-600">{totalDeliveries} total</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-slate-600">{successfulDeliveries} successful</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-slate-600">{totalDeliveries - successfulDeliveries} failed</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm font-medium text-slate-700">{overallSuccessRate}%</span>
            <div className="w-16">
              <Progress value={overallSuccessRate} className="h-1" />
            </div>
          </div>
        </div>
      )}

      {/* Endpoints Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Active Endpoints ({totalEndpoints})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {webhooks.length === 0 ? (
            <div className="text-center py-8">
              <ZapIcon className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No endpoints configured</h3>
              <p className="text-sm text-slate-500 mb-4">
                Create your first endpoint to start routing emails
              </p>
              <Button asChild>
                <Link href="/webhooks?create=true">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Your First Endpoint
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((webhook: Webhook) => (
                <div 
                  key={webhook.id} 
                  className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  {/* Left Side - Main Info */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-100">
                      <WebhookIcon className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 truncate">{webhook.name}</h3>
                        <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                          Webhook
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span className="font-mono truncate">
                          {new URL(webhook.url).hostname}
                        </span>
                        <CopyButton text={webhook.url} label="endpoint URL" />
                        {webhook.secret && (
                          <div className="flex items-center gap-1 text-green-600">
                            <ShieldCheckIcon className="h-3 w-3" />
                            <span className="text-xs">Secured</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side - Status & Actions */}
                  <div className="flex items-center gap-4 ml-4">
                    {/* Performance */}
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-900">{getSuccessRate(webhook)}%</div>
                      <div className="text-xs text-slate-500">success</div>
                    </div>

                    {/* Status */}
                    <div>
                      {getStatusBadge(webhook)}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                        <PlayIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-600 hover:text-slate-700 hover:bg-slate-50">
                        <SettingsIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-600 hover:text-slate-700 hover:bg-slate-50">
                        <MoreHorizontalIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 