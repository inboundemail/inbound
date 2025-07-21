import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../helper/main'
import { db } from '@/lib/db'
import { endpoints } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { generateTestPayload } from '@/lib/webhooks/webhook-formats'
import type { WebhookFormat } from '@/lib/db/schema'

/**
 * POST /api/v2/endpoints/{id}/test
 * Tests an endpoint by sending a test payload
 * Supports webhook, email, and email_group endpoint types
 * For webhooks, supports inbound, discord, and slack formats
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/endpoints/{id}/test types
export interface PostEndpointTestRequest {
  id: string // from params
  webhookFormat?: 'inbound' | 'discord' | 'slack' // optional, defaults to 'inbound'
}

export interface PostEndpointTestResponse {
  success: boolean
  message: string
  responseTime: number
  statusCode?: number
  responseBody?: string
  error?: string
  testPayload?: any
  webhookFormat?: 'inbound' | 'discord' | 'slack'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('🧪 POST /api/v2/endpoints/{id}/test - Starting test for endpoint:', id)
  
  try {
    console.log('🔐 Validating request authentication')
    const { userId, error } = await validateRequest(request)
    if (!userId) {
      console.log('❌ Authentication failed:', error)
      return NextResponse.json(
        { error: error },
        { status: 401 }
      )
    }
    console.log('✅ Authentication successful for userId:', userId)

    // Parse request body for webhook format preference
    let requestData: { webhookFormat?: WebhookFormat } = {}
    try {
      const body = await request.text()
      if (body.trim()) {
        requestData = JSON.parse(body)
      }
    } catch (parseError) {
      console.log('⚠️ Failed to parse request body, using defaults:', parseError)
    }

    const preferredFormat = requestData.webhookFormat || 'inbound'
    console.log('📋 Using webhook format preference:', preferredFormat)

    // Validate webhook format
    if (!['inbound', 'discord', 'slack'].includes(preferredFormat)) {
      console.log('❌ Invalid webhook format:', preferredFormat)
      return NextResponse.json(
        { 
          error: 'Invalid webhook format',
          validFormats: ['inbound', 'discord', 'slack']
        },
        { status: 400 }
      )
    }

    // Check if endpoint exists and belongs to user
    console.log('🔍 Checking if endpoint exists and belongs to user')
    const endpointResult = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, id),
        eq(endpoints.userId, userId)
      ))
      .limit(1)

    if (!endpointResult[0]) {
      console.log('❌ Endpoint not found for user:', userId, 'endpoint:', id)
      return NextResponse.json(
        { error: 'Endpoint not found or access denied' },
        { status: 404 }
      )
    }

    const endpoint = endpointResult[0]
    console.log('✅ Found endpoint:', endpoint.name, 'type:', endpoint.type)

    if (!endpoint.isActive) {
      console.log('❌ Endpoint is disabled:', id)
      return NextResponse.json(
        { 
          success: false,
          message: 'Endpoint is disabled',
          responseTime: 0
        },
        { status: 400 }
      )
    }

    const config = JSON.parse(endpoint.config)
    const startTime = Date.now()

    let testResult: PostEndpointTestResponse = {
      success: false,
      message: 'Test not implemented for this endpoint type',
      responseTime: 0
    }

    switch (endpoint.type) {
      case 'webhook':
        try {
          console.log('🔗 Testing webhook endpoint:', config.url)
          console.log('📋 Using webhook format:', preferredFormat)
          
          // Generate test payload based on format
          const testPayload = generateTestPayload(preferredFormat as WebhookFormat, {
            messageId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            from: 'test@example.com',
            to: ['test@yourdomain.com'],
            subject: 'Test Email - Inbound Email Service',
            recipient: 'test@yourdomain.com'
          })
          
          // Add endpoint info for inbound format
          if (preferredFormat === 'inbound' && typeof testPayload === 'object') {
            testPayload.endpoint = {
              id: endpoint.id,
              name: endpoint.name
            }
          }

          // Parse custom headers safely
          let customHeaders = {}
          if (config.headers) {
            try {
              customHeaders = typeof config.headers === 'string' ? JSON.parse(config.headers) : config.headers
            } catch (headerError) {
              console.warn('⚠️ Invalid custom headers for endpoint', id, ':', headerError)
              customHeaders = {}
            }
          }

          const requestHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': 'InboundEmail-Test/2.0',
            'X-Test-Request': 'true',
            'X-Endpoint-ID': endpoint.id,
            'X-Webhook-Format': preferredFormat,
            ...customHeaders
          }

          console.log('📤 Sending test payload to webhook:', config.url)
          console.log('📋 Request headers:', Object.keys(requestHeaders).join(', '))

          const response = await fetch(config.url, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(testPayload),
            signal: AbortSignal.timeout((config.timeout || 30) * 1000)
          })

          const responseTime = Date.now() - startTime
          let responseBody = ''
          
          try {
            responseBody = await response.text()
          } catch {
            responseBody = 'Unable to read response body'
          }

          testResult = {
            success: response.ok,
            message: response.ok 
              ? `Webhook responded successfully (${response.status})` 
              : `Webhook returned error (${response.status})`,
            responseTime,
            statusCode: response.status,
            responseBody: responseBody.substring(0, 1000), // Limit response body size
            testPayload,
            webhookFormat: preferredFormat
          }

          console.log(`${response.ok ? '✅' : '❌'} Webhook test ${response.ok ? 'passed' : 'failed'}: ${response.status} in ${responseTime}ms`)

        } catch (error) {
          const responseTime = Date.now() - startTime
          let errorMessage = 'Unknown error'
          
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              errorMessage = `Request timeout after ${config.timeout || 30}s`
            } else {
              errorMessage = error.message
            }
          }

          testResult = {
            success: false,
            message: `Webhook test failed: ${errorMessage}`,
            responseTime,
            error: errorMessage,
            webhookFormat: preferredFormat
          }

          console.error('❌ Webhook test failed:', errorMessage)
        }
        break

      case 'email':
        // For email endpoints, we simulate the forwarding process
        try {
          console.log('📧 Testing email forwarding endpoint to:', config.forwardTo)
          
          const responseTime = Date.now() - startTime
          testResult = {
            success: true,
            message: `Email forwarding endpoint configured to forward to: ${config.forwardTo}`,
            responseTime,
            testPayload: {
              type: 'email_forward_test',
              forwardTo: config.forwardTo,
              preserveHeaders: config.preserveHeaders || false,
              subject: 'Test Email - Inbound Email Service',
              from: 'test@example.com',
              timestamp: new Date().toISOString()
            }
          }
          
          console.log('✅ Email endpoint test completed successfully')
        } catch (error) {
          const responseTime = Date.now() - startTime
          testResult = {
            success: false,
            message: 'Email endpoint test failed',
            responseTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
          
          console.error('❌ Email endpoint test failed:', error)
        }
        break

      case 'email_group':
        // For email group endpoints, we simulate the group forwarding process
        try {
          console.log('📧 Testing email group endpoint with', config.emails?.length || 0, 'recipients')
          
          const responseTime = Date.now() - startTime
          testResult = {
            success: true,
            message: `Email group endpoint configured to forward to ${config.emails?.length || 0} recipients`,
            responseTime,
            testPayload: {
              type: 'email_group_test',
              groupEmails: config.emails || [],
              preserveHeaders: config.preserveHeaders || false,
              subject: 'Test Email - Inbound Email Service',
              from: 'test@example.com',
              timestamp: new Date().toISOString()
            }
          }
          
          console.log('✅ Email group endpoint test completed successfully')
        } catch (error) {
          const responseTime = Date.now() - startTime
          testResult = {
            success: false,
            message: 'Email group endpoint test failed',
            responseTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
          
          console.error('❌ Email group endpoint test failed:', error)
        }
        break

      default:
        const responseTime = Date.now() - startTime
        testResult = {
          success: false,
          message: `Unknown endpoint type: ${endpoint.type}`,
          responseTime,
          error: `Unsupported endpoint type: ${endpoint.type}`
        }
        console.log('❌ Unknown endpoint type:', endpoint.type)
    }

    console.log(`${testResult.success ? '✅' : '❌'} Test ${testResult.success ? 'passed' : 'failed'} for endpoint ${id} (${endpoint.type})`)

    return NextResponse.json(testResult)

  } catch (error) {
    console.error('💥 Unexpected error in POST /api/v2/endpoints/{id}/test:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to test endpoint',
        details: error instanceof Error ? error.message : 'Unknown error',
        responseTime: 0
      },
      { status: 500 }
    )
  }
} 