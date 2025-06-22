"use client"

import { useState, useEffect } from 'react'
import { useTestWebhookMutation } from '@/features/webhooks/hooks'
import { Webhook } from '@/features/webhooks/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HiPlay, HiCheckCircle, HiX, HiClock, HiExclamationCircle } from 'react-icons/hi'
import { toast } from 'sonner'

interface TestResult {
  success: boolean
  statusCode?: number
  message?: string
  error?: string
  timestamp: Date
}

interface TestWebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhook: Webhook | null
}

export function TestWebhookDialog({ open, onOpenChange, webhook }: TestWebhookDialogProps) {
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testHistory, setTestHistory] = useState<TestResult[]>([])
  
  const testWebhookMutation = useTestWebhookMutation()

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!testWebhookMutation.isPending && webhook && webhook.isActive) {
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
  }, [open, testWebhookMutation.isPending, webhook])

  const handleTest = async () => {
    if (!webhook) return

    try {
      const result = await testWebhookMutation.mutateAsync(webhook.id)
      const testResult: TestResult = {
        success: result.success,
        statusCode: result.statusCode,
        message: result.message,
        timestamp: new Date()
      }
      
      setTestResult(testResult)
      setTestHistory(prev => [testResult, ...prev.slice(0, 4)]) // Keep last 5 results
      
      if (result.success) {
        toast.success('Webhook test successful!')
      } else {
        toast.error('Webhook test failed')
      }
    } catch (error) {
      const errorResult: TestResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
        timestamp: new Date()
      }
      
      setTestResult(errorResult)
      setTestHistory(prev => [errorResult, ...prev.slice(0, 4)])
      toast.error('Webhook test failed')
    }
  }

  const getStatusIcon = (result: TestResult) => {
    if (result.success) {
      return <HiCheckCircle className="h-4 w-4 text-green-600" />
    } else {
      return <HiX className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusBadge = (result: TestResult) => {
    if (result.success) {
      return (
        <Badge className="bg-green-500 text-white text-xs">
          Success {result.statusCode && `(${result.statusCode})`}
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-red-500 text-white text-xs">
          Failed {result.statusCode && `(${result.statusCode})`}
        </Badge>
      )
    }
  }

  const handleClose = () => {
    setTestResult(null)
    onOpenChange(false)
  }

  if (!webhook) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
              <HiPlay className="h-4 w-4 text-blue-600" />
            </div>
            Test Webhook
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 border">
            <h4 className="font-medium text-gray-900 mb-2">{webhook.name}</h4>
            <p className="text-sm text-gray-600 font-mono break-all">{webhook.url}</p>
            {webhook.description && (
              <p className="text-sm text-gray-500 mt-2">{webhook.description}</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <HiExclamationCircle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-blue-800 mb-1">
                  Test Delivery
                </h4>
                <p className="text-sm text-blue-700">
                  This will send a test payload to your webhook endpoint to verify it's working correctly.
                </p>
              </div>
            </div>
          </div>

          {testResult && (
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  {getStatusIcon(testResult)}
                  Latest Test Result
                </h4>
                {getStatusBadge(testResult)}
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Timestamp:</span>
                  <span className="text-gray-900">{testResult.timestamp.toLocaleString()}</span>
                </div>
                
                {testResult.statusCode && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status Code:</span>
                    <span className="text-gray-900">{testResult.statusCode}</span>
                  </div>
                )}
                
                {testResult.message && (
                  <div>
                    <span className="text-gray-600">Message:</span>
                    <p className="text-gray-900 mt-1 p-2 bg-gray-50 rounded text-xs font-mono">
                      {testResult.message}
                    </p>
                  </div>
                )}
                
                {testResult.error && (
                  <div>
                    <span className="text-gray-600">Error:</span>
                    <p className="text-red-600 mt-1 p-2 bg-red-50 rounded text-xs">
                      {testResult.error}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {testHistory.length > 1 && (
            <div className="bg-white border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Recent Tests</h4>
              <div className="space-y-2">
                {testHistory.slice(1).map((result, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result)}
                      <span className="text-sm text-gray-600">
                        {result.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.statusCode && (
                        <span className="text-xs text-gray-500">{result.statusCode}</span>
                      )}
                      {getStatusBadge(result)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3">
            <h5 className="text-sm font-medium text-gray-900 mb-2">Test Payload Preview</h5>
            <pre className="text-xs text-gray-600 overflow-x-auto">
{`{
  "event": "webhook_test",
  "timestamp": "${new Date().toISOString()}",
  "webhook_id": "${webhook.id}",
  "test": true,
  "data": {
    "message": "This is a test webhook delivery from Inbound"
  }
}`}
            </pre>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Press Cmd+Enter to test
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Close
            </Button>
            <Button
              onClick={handleTest}
              disabled={testWebhookMutation.isPending || !webhook.isActive}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {testWebhookMutation.isPending ? (
                <>
                  <HiClock className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <HiPlay className="h-4 w-4 mr-2" />
                  Send Test
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 