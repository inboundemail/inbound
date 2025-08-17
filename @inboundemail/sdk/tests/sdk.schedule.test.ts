/**
 * Comprehensive tests for SDK email scheduling functionality
 * Tests the enhanced schedule/cancel methods with proper types
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { Inbound } from '../src/index'
import type { 
  PostScheduleEmailRequest,
  PostScheduleEmailResponse,
  GetScheduledEmailsResponse,
  GetScheduledEmailResponse,
  DeleteScheduledEmailResponse,
  ApiResponse
} from '../src/types'

// Test configuration
const TEST_API_KEY = "uHpoGGrqCpinyLltyiOAkqKsqzOuTbyoxnueruOyUQpfuQDJefSHSdQlsIghaHIH"
const TEST_FROM_EMAIL = 'SDK Schedule Test <agent@inbnd.dev>'
const TEST_TO_EMAIL = 'inboundemaildotnew@gmail.com'
const API_BASE_URL = 'http://localhost:3000'

// Initialize SDK client
const inbound = new Inbound(TEST_API_KEY, `${API_BASE_URL}/api/v2`)

// Store created scheduled email IDs for cleanup
const createdScheduledEmailIds: string[] = []

describe('SDK Email Scheduling - Enhanced API Tests', () => {
  
  beforeAll(() => {
    console.log('⏰ Setting up SDK email scheduling tests')
    console.log('  API Base URL:', API_BASE_URL)
    console.log('  From Email:', TEST_FROM_EMAIL)
    console.log('  To Email:', TEST_TO_EMAIL)
  })

  describe('📅 Basic Scheduling Functionality', () => {
    
    test('should schedule email with natural language date', async () => {
      console.log('📧 Testing schedule with natural language')
      
      const scheduleRequest: PostScheduleEmailRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Natural Language Scheduling',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #333;">Natural Language Scheduling Test</h1>
            <p>This email was scheduled using natural language: "in 2 minutes"</p>
            <p>Sent via Inbound Email SDK v3.3.0</p>
          </div>
        `,
        text: 'This email was scheduled using natural language: "in 2 minutes"',
        scheduled_at: 'in 2 minutes',
        timezone: 'America/New_York'
      }

      const response: ApiResponse<PostScheduleEmailResponse> = await inbound.emails.schedule(scheduleRequest)
      
      console.log('📊 Schedule Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      if (response.data) {
        expect(response.data.id).toBeDefined()
        expect(typeof response.data.id).toBe('string')
        expect(response.data.status).toBe('scheduled')
        expect(response.data.scheduled_at).toBeDefined()
        expect(response.data.timezone).toBe('America/New_York')
        
        createdScheduledEmailIds.push(response.data.id)
        console.log('✅ Email scheduled successfully with ID:', response.data.id)
        console.log('📅 Scheduled for:', response.data.scheduled_at)
      }
    })

    test('should schedule email with ISO 8601 date', async () => {
      console.log('📧 Testing schedule with ISO 8601 date')
      
      // Schedule for 3 minutes from now
      const futureDate = new Date(Date.now() + 3 * 60 * 1000).toISOString()
      
      const scheduleRequest: PostScheduleEmailRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - ISO 8601 Scheduling',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #333;">ISO 8601 Scheduling Test</h1>
            <p>This email was scheduled using ISO 8601 format: ${futureDate}</p>
            <p>Sent via Inbound Email SDK v3.3.0</p>
          </div>
        `,
        text: `This email was scheduled using ISO 8601 format: ${futureDate}`,
        scheduled_at: futureDate
      }

      const response: ApiResponse<PostScheduleEmailResponse> = await inbound.emails.schedule(scheduleRequest)
      
      console.log('📊 ISO Schedule Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      if (response.data) {
        expect(response.data.id).toBeDefined()
        expect(response.data.status).toBe('scheduled')
        expect(response.data.scheduled_at).toBeDefined()
        
        createdScheduledEmailIds.push(response.data.id)
        console.log('✅ Email scheduled with ISO date, ID:', response.data.id)
      }
    })

    test('should schedule email with attachments and CID images', async () => {
      console.log('📧 Testing schedule with attachments and CID')
      
      // Small test image (1x1 PNG)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      
      const scheduleRequest: PostScheduleEmailRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Scheduled Email with Attachments',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #333;">Scheduled Email with Attachments</h1>
            <p>This email contains both embedded and downloadable attachments:</p>
            
            <div style="text-align: center; margin: 20px 0;">
              <img src="cid:test-logo" alt="Test Logo" style="width: 100px; height: 100px; border: 2px solid #ccc;" />
              <p><em>Embedded image via CID</em></p>
            </div>
            
            <p>📎 Also includes a downloadable PDF attachment</p>
            <p>Scheduled via Inbound Email SDK v3.3.0</p>
          </div>
        `,
        text: 'This scheduled email contains both embedded and downloadable attachments.',
        scheduled_at: 'in 4 minutes',
        attachments: [
          {
            content: testImageBase64,
            filename: 'test-logo.png',
            contentType: 'image/png',
            content_id: 'test-logo'
          },
          {
            content: Buffer.from('Sample PDF content for testing').toString('base64'),
            filename: 'test-document.pdf',
            contentType: 'application/pdf'
          }
        ]
      }

      const response: ApiResponse<PostScheduleEmailResponse> = await inbound.emails.schedule(scheduleRequest)
      
      console.log('📊 Schedule with Attachments Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      if (response.data) {
        expect(response.data.id).toBeDefined()
        expect(response.data.status).toBe('scheduled')
        
        createdScheduledEmailIds.push(response.data.id)
        console.log('✅ Email with attachments scheduled, ID:', response.data.id)
        console.log('📎 Attachments: CID image + PDF download')
      }
    })
  })

  describe('📋 Scheduled Email Management', () => {
    
    test('should list scheduled emails', async () => {
      console.log('📋 Testing list scheduled emails')
      
      const response: ApiResponse<GetScheduledEmailsResponse> = await inbound.emails.listScheduled({
        limit: 10,
        status: 'scheduled'
      })
      
      console.log('📊 List Scheduled Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      if (response.data) {
        expect(response.data.data).toBeDefined()
        expect(Array.isArray(response.data.data)).toBe(true)
        expect(response.data.pagination).toBeDefined()
        expect(response.data.pagination.limit).toBe(10)
        
        console.log('✅ Found scheduled emails:', response.data.data.length)
        
        // Log details of first few emails
        response.data.data.slice(0, 3).forEach((email, index) => {
          console.log(`📧 Email ${index + 1}:`, {
            id: email.id,
            subject: email.subject,
            scheduled_at: email.scheduled_at,
            status: email.status
          })
        })
      }
    })

    test('should get specific scheduled email details', async () => {
      if (createdScheduledEmailIds.length === 0) {
        console.log('⚠️ No scheduled emails to test - skipping')
        return
      }
      
      console.log('🔍 Testing get scheduled email details')
      
      const emailId = createdScheduledEmailIds[0]
      const response: ApiResponse<GetScheduledEmailResponse> = await inbound.emails.getScheduled(emailId!)
      
      console.log('📊 Get Scheduled Email Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      if (response.data) {
        expect(response.data.id).toBe(emailId!)
        expect(response.data.from).toBeDefined()
        expect(response.data.to).toBeDefined()
        expect(response.data.subject).toBeDefined()
        expect(response.data.scheduled_at).toBeDefined()
        expect(response.data.status).toBeDefined()
        expect(response.data.timezone).toBeDefined()
        
        console.log('✅ Retrieved scheduled email details:', {
          id: response.data.id,
          subject: response.data.subject,
          status: response.data.status,
          scheduled_at: response.data.scheduled_at,
          attempts: response.data.attempts
        })
      }
    })

    test('should cancel a scheduled email', async () => {
      if (createdScheduledEmailIds.length === 0) {
        console.log('⚠️ No scheduled emails to cancel - skipping')
        return
      }
      
      console.log('❌ Testing cancel scheduled email')
      
      const emailId = createdScheduledEmailIds[0]
      const response: ApiResponse<DeleteScheduledEmailResponse> = await inbound.emails.cancel(emailId!)
      
      console.log('📊 Cancel Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      if (response.data) {
        expect(response.data.id).toBe(emailId!)
        expect(response.data.status).toBe('cancelled')
        expect(response.data.cancelled_at).toBeDefined()
        
        console.log('✅ Email cancelled successfully:', {
          id: response.data.id,
          status: response.data.status,
          cancelled_at: response.data.cancelled_at
        })
        
        // Remove from our tracking array since it's cancelled
        const index = createdScheduledEmailIds.indexOf(emailId!)
        if (index > -1) {
          createdScheduledEmailIds.splice(index, 1)
        }
      }
    })
  })

  describe('⚠️ Error Handling', () => {
    
    test('should handle invalid scheduled_at date', async () => {
      console.log('⚠️ Testing invalid scheduled_at date')
      
      const scheduleRequest: PostScheduleEmailRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'Invalid Schedule Test',
        html: '<p>This should fail</p>',
        scheduled_at: 'invalid date format'
      }

      const response: ApiResponse<PostScheduleEmailResponse> = await inbound.emails.schedule(scheduleRequest)
      
      console.log('📊 Invalid Date Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      
      console.log('✅ Invalid date properly rejected:', response.error)
    })

    test('should handle past date scheduling', async () => {
      console.log('⚠️ Testing past date scheduling')
      
      const pastDate = new Date(Date.now() - 60 * 1000).toISOString() // 1 minute ago
      
      const scheduleRequest: PostScheduleEmailRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'Past Date Test',
        html: '<p>This should fail</p>',
        scheduled_at: pastDate
      }

      const response: ApiResponse<PostScheduleEmailResponse> = await inbound.emails.schedule(scheduleRequest)
      
      console.log('📊 Past Date Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      
      console.log('✅ Past date properly rejected:', response.error)
    })

    test('should handle cancelling non-existent email', async () => {
      console.log('⚠️ Testing cancel non-existent email')
      
      const fakeId = 'non-existent-email-id'
      const response: ApiResponse<DeleteScheduledEmailResponse> = await inbound.emails.cancel(fakeId)
      
      console.log('📊 Cancel Non-existent Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      
      console.log('✅ Non-existent email cancel properly rejected:', response.error)
    })
  })

  describe('🔄 Backwards Compatibility', () => {
    
    test('should support deprecated cancelScheduled method', async () => {
      console.log('🔄 Testing deprecated cancelScheduled method')
      
      // First schedule an email to cancel
      const scheduleRequest: PostScheduleEmailRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'Deprecated Cancel Test',
        html: '<p>This will be cancelled using deprecated method</p>',
        scheduled_at: 'in 5 minutes'
      }

      const scheduleResponse = await inbound.emails.schedule(scheduleRequest)
      
      if (scheduleResponse.data) {
        const emailId = scheduleResponse.data.id
        
        // Use deprecated method
        const cancelResponse: ApiResponse<DeleteScheduledEmailResponse> = await inbound.emails.cancelScheduled(emailId)
        
        console.log('📊 Deprecated Cancel Response:', cancelResponse)

        expect(cancelResponse.error).toBeUndefined()
        expect(cancelResponse.data).toBeDefined()
        
        if (cancelResponse.data) {
          expect(cancelResponse.data.status).toBe('cancelled')
          console.log('✅ Deprecated cancelScheduled method works')
        }
      }
    })
  })
})

console.log('🧪 SDK Email Scheduling Tests Setup Complete')