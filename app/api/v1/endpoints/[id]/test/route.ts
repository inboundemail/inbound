import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { endpoints } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`🧪 POST /api/v1/endpoints/${params.id}/test - Testing endpoint`)
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn(`❌ POST /api/v1/endpoints/${params.id}/test - Unauthorized request`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if endpoint exists and belongs to user
    const endpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, params.id),
        eq(endpoints.userId, session.user.id)
      ))
      .limit(1)

    if (!endpoint[0]) {
      return NextResponse.json(
        { error: 'Endpoint not found or access denied' },
        { status: 404 }
      )
    }

    if (!endpoint[0].isActive) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Endpoint is disabled',
          responseTime: 0
        },
        { status: 400 }
      )
    }

    const config = JSON.parse(endpoint[0].config)
    const startTime = Date.now()

    let testResult: any = {
      success: false,
      message: 'Test not implemented for this endpoint type',
      responseTime: 0
    }

    switch (endpoint[0].type) {
      case 'webhook':
        // Test webhook by sending a test payload
        try {
          console.log(`🔗 Testing webhook: ${config.url}`)
          
          const testPayload = {
            event: 'test',
            timestamp: new Date().toISOString(),
            message: 'This is a test request from the Inbound Email service',
            endpoint: {
              id: endpoint[0].id,
              name: endpoint[0].name
            },
            test: true
          }

          const response = await fetch(config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'InboundEmail-Test/1.0',
              'X-Test-Request': 'true',
              'X-Endpoint-ID': endpoint[0].id,
              ...(config.headers ? JSON.parse(config.headers) : {})
            },
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
            responseBody: responseBody.substring(0, 500) // Limit response body size
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
            error: errorMessage
          }

          console.error(`❌ Webhook test failed:`, errorMessage)
        }
        break

      case 'email':
        // For email endpoints, validate the configuration
        try {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          const isValidEmail = emailRegex.test(config.forwardTo)
          
          // Check if fromAddress is valid if provided
          let fromAddressValid = true
          if (config.fromAddress) {
            fromAddressValid = emailRegex.test(config.fromAddress)
          }

          testResult = {
            success: isValidEmail && fromAddressValid,
            message: isValidEmail && fromAddressValid
              ? `Email configuration is valid (forwards to: ${config.forwardTo})`
              : !isValidEmail 
                ? `Invalid forward-to email address: ${config.forwardTo}`
                : `Invalid from address: ${config.fromAddress}`,
            responseTime: Date.now() - startTime,
            config: {
              forwardTo: config.forwardTo,
              fromAddress: config.fromAddress || 'auto-detected',
              includeAttachments: config.includeAttachments ?? true,
              subjectPrefix: config.subjectPrefix || 'none'
            }
          }

          console.log(`${testResult.success ? '✅' : '❌'} Email endpoint test ${testResult.success ? 'passed' : 'failed'}`)

        } catch (error) {
          testResult = {
            success: false,
            message: `Email configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            responseTime: Date.now() - startTime
          }
        }
        break

      case 'email_group':
        // For email group endpoints, validate all email addresses
        try {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          const emails = config.emails || []
          const validEmails = emails.filter((email: string) => emailRegex.test(email))
          const invalidEmails = emails.filter((email: string) => !emailRegex.test(email))
          
          // Check if fromAddress is valid if provided
          let fromAddressValid = true
          if (config.fromAddress) {
            fromAddressValid = emailRegex.test(config.fromAddress)
          }

          const allValid = invalidEmails.length === 0 && emails.length > 0 && fromAddressValid

          testResult = {
            success: allValid,
            message: allValid
              ? `Email group configuration is valid (${validEmails.length} recipients)`
              : invalidEmails.length > 0
                ? `Invalid email addresses: ${invalidEmails.join(', ')}`
                : emails.length === 0
                  ? 'Email group must have at least one email address'
                  : `Invalid from address: ${config.fromAddress}`,
            responseTime: Date.now() - startTime,
            config: {
              totalEmails: emails.length,
              validEmails: validEmails.length,
              invalidEmails: invalidEmails.length,
              fromAddress: config.fromAddress || 'auto-detected',
              includeAttachments: config.includeAttachments ?? true,
              subjectPrefix: config.subjectPrefix || 'none'
            }
          }

          console.log(`${testResult.success ? '✅' : '❌'} Email group test ${testResult.success ? 'passed' : 'failed'}`)

        } catch (error) {
          testResult = {
            success: false,
            message: `Email group configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            responseTime: Date.now() - startTime
          }
        }
        break

      default:
        testResult = {
          success: false,
          message: `Unknown endpoint type: ${endpoint[0].type}`,
          responseTime: Date.now() - startTime
        }
    }

    console.log(`${testResult.success ? '✅' : '❌'} Test ${testResult.success ? 'passed' : 'failed'} for endpoint ${params.id} (${endpoint[0].type})`)

    return NextResponse.json(testResult)

  } catch (error) {
    console.error(`❌ POST /api/v1/endpoints/${params.id}/test - Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test endpoint',
        details: error instanceof Error ? error.message : 'Unknown error',
        responseTime: 0
      },
      { status: 500 }
    )
  }
} 