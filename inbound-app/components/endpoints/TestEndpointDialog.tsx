"use client"

import { useState, useEffect } from 'react'
import { useTestEndpointMutation, type WebhookFormat, type TestEndpointResponse } from '@/features/endpoints/hooks'
import { Endpoint } from '@/features/endpoints/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import CirclePlay from '@/components/icons/circle-play'
import CircleCheck from '@/components/icons/circle-check'
import TabClose from '@/components/icons/tab-close'
import Clock2 from '@/components/icons/clock-2'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import BoltLightning from '@/components/icons/bolt-lightning'
import Envelope2 from '@/components/icons/envelope-2'
import UserGroup from '@/components/icons/user-group'
import { toast } from 'sonner'

interface TestResult extends TestEndpointResponse {
  timestamp: Date
}

interface TestEndpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: Endpoint | null
}

export function TestEndpointDialog({ open, onOpenChange, endpoint }: TestEndpointDialogProps) {
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [selectedWebhookFormat, setSelectedWebhookFormat] = useState<WebhookFormat>('inbound')
  const testEndpointMutation = useTestEndpointMutation()

  // Default the webhook test format to the endpoint's configured format when endpoint changes
  useEffect(() => {
    if (endpoint?.type === 'webhook') {
      const configured = (endpoint.webhookFormat as WebhookFormat) || 'inbound'
      setSelectedWebhookFormat(configured)
    }
  }, [endpoint])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!testEndpointMutation.isPending && endpoint?.isActive) {
          handleTest()
        }
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, testEndpointMutation.isPending, endpoint])

  const handleTest = async () => {
    if (!endpoint) return

    try {
      setTestResult(null)
      const result = await testEndpointMutation.mutateAsync({
        id: endpoint.id,
        webhookFormat: endpoint.type === 'webhook' ? selectedWebhookFormat : undefined
      })
      
      setTestResult({
        ...result,
        timestamp: new Date()
      })

      if (result.success) {
        toast.success('Endpoint test completed successfully!')
      } else {
        toast.error(result.message || 'Endpoint test failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Test failed'
      setTestResult({
        success: false,
        message: errorMessage,
        responseTime: 0,
        error: errorMessage,
        timestamp: new Date()
      })
      toast.error(errorMessage)
    }
  }

  const handleClose = () => {
    setTestResult(null)
    onOpenChange(false)
  }

  const getEndpointIcon = () => {
    switch (endpoint?.type) {
      case 'webhook':
        return BoltLightning
      case 'email':
        return Envelope2
      case 'email_group':
        return UserGroup
      default:
        return CirclePlay
    }
  }

  const getEndpointTypeLabel = () => {
    switch (endpoint?.type) {
      case 'webhook':
        return 'Webhook'
      case 'email':
        return 'Email Forward'
      case 'email_group':
        return 'Email Group'
      default:
        return 'Endpoint'
    }
  }

  const getConfigSummary = () => {
    if (!endpoint?.config) return null

    try {
      const config = JSON.parse(endpoint.config)
      
      switch (endpoint.type) {
        case 'webhook':
          return config.url
        case 'email':
          return `Forward to: ${config.forwardTo}`
        case 'email_group':
          return `Forward to: ${config.emails?.length || 0} recipients`
        default:
          return null
      }
    } catch {
      return null
    }
  }

  const getTestDescription = () => {
    switch (endpoint?.type) {
      case 'webhook':
        return 'This will send a test HTTP request to your webhook endpoint with the selected format to verify it\'s working correctly.'
      case 'email':
        return 'This will validate the email configuration and verify the forwarding address.'
      case 'email_group':
        return 'This will validate the email group configuration and verify all recipient addresses.'
      default:
        return 'This will test the endpoint configuration.'
    }
  }

  if (!endpoint) return null

  const EndpointIcon = getEndpointIcon()
  const configSummary = getConfigSummary()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
              <CirclePlay width="16" height="16" className="text-primary" />
            </div>
            Test {getEndpointTypeLabel()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <EndpointIcon width="16" height="16" className="text-muted-foreground" />
              <h4 className="font-medium text-foreground">{endpoint.name}</h4>
              <Badge variant="secondary" className="text-xs">
                {getEndpointTypeLabel()}
              </Badge>
              <Badge 
                className={`text-xs ${
                  endpoint.isActive 
                    ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' 
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {endpoint.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {configSummary && (
              <p className="text-sm text-muted-foreground font-mono break-all">{configSummary}</p>
            )}
            {endpoint.description && (
              <p className="text-sm text-muted-foreground mt-2">{endpoint.description}</p>
            )}
          </div>

          {endpoint.type === 'webhook' && (
            <div className="space-y-2">
              <Label htmlFor="webhook-format" className="text-sm font-medium">
                Webhook Format
              </Label>
              <Select value={selectedWebhookFormat} onValueChange={(value: WebhookFormat) => setSelectedWebhookFormat(value)}>
                <SelectTrigger id="webhook-format">
                  <SelectValue placeholder="Select webhook format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound" className="flex flex-col items-start py-3 gap-1">
                    <span className="font-medium">Inbound Format</span>
                    <span className="text-xs text-muted-foreground ml-2">Standard email webhook with full data</span>
                  </SelectItem>
                  <SelectItem value="discord" className="flex flex-col items-start py-3 gap-1">
                    <span className="font-medium">Discord Format</span>
                    <span className="text-xs text-muted-foreground ml-2">Discord-compatible webhook with rich embeds</span>
                  </SelectItem>
                  <SelectItem value="slack" className="flex flex-col items-start py-3 gap-1">
                    <span className="font-medium">Slack Format</span>
                    <span className="text-xs text-muted-foreground ml-2">Slack-compatible webhook with attachments</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {!endpoint.isActive && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 dark:bg-yellow-900/20 dark:border-yellow-800">
              <div className="flex items-start gap-2">
                <CircleWarning2 width="16" height="16" className="text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-400 mb-1">
                    Endpoint is disabled
                  </h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    This endpoint is currently disabled and won't receive real emails. You can still test it, but it won't be triggered by actual email deliveries.
                  </p>
                </div>
              </div>
            </div>
          )}

          {testResult && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Test Results</h4>
              <div className={`p-3 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                  : 'bg-destructive/10 border-destructive/20'
              }`}>
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CircleCheck width="16" height="16" className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <TabClose width="16" height="16" className="text-destructive mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className={`text-sm font-medium mb-1 ${
                      testResult.success ? 'text-green-800 dark:text-green-400' : 'text-destructive'
                    }`}>
                      {testResult.success ? 'Test Successful' : 'Test Failed'}
                    </div>
                    {testResult.message && (
                      <p className={`text-sm ${
                        testResult.success ? 'text-green-700 dark:text-green-300' : 'text-destructive/80'
                      }`}>
                        {testResult.message}
                      </p>
                    )}
                    {testResult.error && (
                      <p className="text-sm text-destructive/80 font-mono mt-1">
                        {testResult.error}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {testResult.statusCode && (
                        <span>Status: {testResult.statusCode}</span>
                      )}
                      {testResult.responseTime !== undefined && (
                        <span>Response: {testResult.responseTime}ms</span>
                      )}
                      {testResult.webhookFormat && (
                        <span>Format: {testResult.webhookFormat}</span>
                      )}
                      <span>
                        <Clock2 width="12" height="12" className="inline mr-1" />
                        {testResult.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-muted rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <CirclePlay width="16" height="16" className="text-muted-foreground" />
              <h4 className="text-sm font-medium text-foreground">Test Information</h4>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• This will send a test email to your endpoint</p>
              <p>• The test email contains sample data to verify your endpoint is working</p>
              <p>• Check your endpoint logs to see the received data</p>
              {endpoint.type === 'webhook' && (
                <>
                  <p>• For webhooks, we'll send a POST request with email data in the selected format</p>
                  <p>• Inbound format: Full email data with headers and metadata</p>
                  <p>• Discord format: Rich embeds compatible with Discord webhooks</p>
                  <p>• Slack format: Attachments compatible with Slack webhooks</p>
                </>
              )}
              {(endpoint.type === 'email' || endpoint.type === 'email_group') && (
                <p>• For email forwards, we'll validate the configuration without sending actual emails</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Press Cmd+Enter to test
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={handleTest}
              disabled={testEndpointMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {testEndpointMutation.isPending ? 'Testing...' : 'Run Test'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 