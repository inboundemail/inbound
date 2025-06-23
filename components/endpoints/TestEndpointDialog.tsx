"use client"

import { useState, useEffect } from 'react'
import { useTestEndpointMutation } from '@/features/endpoints/hooks'
import { Endpoint } from '@/features/endpoints/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HiPlay, HiCheckCircle, HiX, HiClock, HiExclamationCircle, HiLightningBolt, HiMail, HiUserGroup } from 'react-icons/hi'
import { toast } from 'sonner'

interface TestResult {
  success: boolean
  statusCode?: number
  message?: string
  responseTime?: number
  error?: string
  timestamp: Date
}

interface TestEndpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: Endpoint | null
}

export function TestEndpointDialog({ open, onOpenChange, endpoint }: TestEndpointDialogProps) {
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const testEndpointMutation = useTestEndpointMutation()

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
      const result = await testEndpointMutation.mutateAsync(endpoint.id)
      
      setTestResult({
        success: result.success,
        statusCode: result.statusCode,
        message: result.message,
        responseTime: result.responseTime,
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
        return HiLightningBolt
      case 'email':
        return HiMail
      case 'email_group':
        return HiUserGroup
      default:
        return HiPlay
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
        return 'This will send a test HTTP request to your webhook endpoint to verify it\'s working correctly.'
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
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
              <HiPlay className="h-4 w-4 text-blue-600" />
            </div>
            Test {getEndpointTypeLabel()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 border">
            <div className="flex items-center gap-2 mb-2">
              <EndpointIcon className="h-4 w-4 text-gray-500" />
              <h4 className="font-medium text-gray-900">{endpoint.name}</h4>
              <Badge variant="secondary" className="text-xs">
                {getEndpointTypeLabel()}
              </Badge>
              <Badge 
                className={`text-xs ${
                  endpoint.isActive 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {endpoint.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {configSummary && (
              <p className="text-sm text-gray-600 font-mono break-all">{configSummary}</p>
            )}
            {endpoint.description && (
              <p className="text-sm text-gray-500 mt-2">{endpoint.description}</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <HiExclamationCircle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-blue-800 mb-1">
                  Test {getEndpointTypeLabel()}
                </h4>
                <p className="text-sm text-blue-700">
                  {getTestDescription()}
                </p>
              </div>
            </div>
          </div>

          {!endpoint.isActive && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <HiExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-amber-800 mb-1">
                    Endpoint Disabled
                  </h4>
                  <p className="text-sm text-amber-700">
                    This endpoint is currently disabled. Enable it first to test functionality.
                  </p>
                </div>
              </div>
            </div>
          )}

          {testResult && (
            <div className={`rounded-lg p-4 border ${
              testResult.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {testResult.success ? (
                  <HiCheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <HiX className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <h4 className={`text-sm font-medium mb-1 ${
                    testResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {testResult.success ? 'Test Successful' : 'Test Failed'}
                  </h4>
                  
                  {testResult.statusCode && (
                    <p className={`text-sm mb-1 ${
                      testResult.success ? 'text-green-700' : 'text-red-700'
                    }`}>
                      Status Code: {testResult.statusCode}
                    </p>
                  )}
                  
                  {testResult.message && (
                    <p className={`text-sm mb-1 ${
                      testResult.success ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {testResult.message}
                    </p>
                  )}
                  
                  {testResult.error && (
                    <p className="text-sm text-red-700 font-mono bg-red-100 p-2 rounded mt-2">
                      {testResult.error}
                    </p>
                  )}
                  
                  <p className={`text-xs mt-2 ${
                    testResult.success ? 'text-green-600' : 'text-red-600'
                  }`}>
                    Tested at {testResult.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          )}
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
              disabled={testEndpointMutation.isPending || !endpoint.isActive}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {testEndpointMutation.isPending ? (
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