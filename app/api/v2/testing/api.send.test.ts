/**
 * Comprehensive tests for v2 API email sending with attachments
 * Tests both remote file attachments (path) and base64 attachments (content)
 * Follows v2 API testing patterns and Resend compatibility
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import fs from 'fs'

// Test configuration
const API_BASE_URL = 'http://localhost:3000'
const TEST_API_KEY = "uHpoGGrqCpinyLltyiOAkqKsqzOuTbyoxnueruOyUQpfuQDJefSHSdQlsIghaHIH"
const TEST_FROM_EMAIL = 'agent@inbnd.dev'
const TEST_TO_EMAIL = 'inboundemaildotnew@gmail.com'

// Helper function to make authenticated API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}/api/v2${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TEST_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  
  const data = await response.json()
  return { response, data }
}

// Sample base64 content for testing (small PNG image)
const SAMPLE_BASE64_PNG = fs.readFileSync('/Users/ryanvogel/devlocal/inbound/inbound-app/app/api/v2/testing/jpegimage.jpeg', 'base64')

// Sample STL file content
const SAMPLE_BASE64_STL = fs.readFileSync('/Users/ryanvogel/devlocal/inbound/inbound-app/app/api/v2/testing/randomstlfile.stl', 'base64')

describe('v2 API Email Sending with Attachments', () => {
  
  beforeAll(() => {
    console.log('🧪 Starting attachment tests with configuration:')
    console.log('  API Base URL:', API_BASE_URL)
    console.log('  From Email:', TEST_FROM_EMAIL)
    console.log('  To Email:', TEST_TO_EMAIL)
  })

  describe('📎 Base64 Attachment Tests', () => {
    
    test('should send email with single base64 attachment', async () => {
      console.log('📧 Testing single base64 attachment')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Email with Base64 Attachment',
          text: 'This email contains a base64 encoded PNG attachment.',
          html: '<p>This email contains a <strong>base64 encoded PNG</strong> attachment.</p>',
          attachments: [
            {
              content: SAMPLE_BASE64_PNG,
              filename: 'test-image.png',
              contentType: 'image/png'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('messageId')
      expect(typeof data.id).toBe('string')
      expect(data.id.length).toBeGreaterThan(0)
    })

    test('should send email with multiple base64 attachments', async () => {
      console.log('📧 Testing multiple base64 attachments')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Email with Multiple Base64 Attachments',
          text: 'This email contains multiple base64 encoded attachments.',
          html: '<p>This email contains <strong>multiple base64 encoded</strong> attachments.</p>',
          attachments: [
            {
              content: SAMPLE_BASE64_PNG,
              filename: 'image1.png',
              contentType: 'image/png'
            },
            {
              content: SAMPLE_BASE64_STL,
              filename: 'document.stl',
              contentType: 'application/stl'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('messageId')
    })

    test('should support legacy snake_case content_type', async () => {
      console.log('📧 Testing legacy snake_case content_type support')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Legacy content_type Format',
          text: 'Testing backward compatibility with snake_case.',
          attachments: [
            {
              content: SAMPLE_BASE64_PNG,
              filename: 'legacy-test.png',
              content_type: 'image/png' // snake_case format
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
    })

    test('should auto-detect content type from base64 content', async () => {
      console.log('📧 Testing content type auto-detection')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Auto Content Type Detection',
          text: 'Testing automatic content type detection from base64.',
          attachments: [
            {
              content: SAMPLE_BASE64_PNG,
              filename: 'auto-detect.png'
              // No contentType specified - should auto-detect as image/png
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
    })
  })

  describe('🌐 Remote File Attachment Tests', () => {
    
    test('should send email with remote file attachment', async () => {
      console.log('📧 Testing remote file attachment')
      
      // Using a reliable public image for testing
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Email with Remote File Attachment',
          text: 'This email contains a remote file attachment.',
          html: '<p>This email contains a <strong>remote file</strong> attachment.</p>',
          attachments: [
            {
              path: 'https://httpbin.org/image/png',
              filename: 'remote-image.png'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('messageId')
    })

    test('should handle remote file with explicit content type', async () => {
      console.log('📧 Testing remote file with explicit content type')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Remote File with Content Type',
          text: 'Testing remote file with explicit content type.',
          attachments: [
            {
              path: 'https://httpbin.org/image/jpeg',
              filename: 'remote-photo.jpg',
              contentType: 'image/jpeg'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
    })

    test('should handle mixed remote and base64 attachments', async () => {
      console.log('📧 Testing mixed remote and base64 attachments')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Mixed Attachment Types',
          text: 'This email has both remote and base64 attachments.',
          html: '<p>This email has both <strong>remote</strong> and <strong>base64</strong> attachments.</p>',
          attachments: [
            {
              path: 'https://httpbin.org/image/png',
              filename: 'remote-file.png'
            },
            {
              content: SAMPLE_BASE64_STL,
              filename: 'local-document.stl',
              contentType: 'application/stl'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
    })
  })

  describe('❌ Error Handling Tests', () => {
    
    test('should reject attachment without filename', async () => {
      console.log('📧 Testing missing filename error')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Missing Filename',
          text: 'This should fail due to missing filename.',
          attachments: [
            {
              content: SAMPLE_BASE64_PNG
              // Missing filename
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('filename is required')
    })

    test('should reject attachment without content or path', async () => {
      console.log('📧 Testing missing content/path error')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Missing Content',
          text: 'This should fail due to missing content and path.',
          attachments: [
            {
              filename: 'empty-attachment.txt'
              // Missing both content and path
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('either \'path\' (remote URL) or \'content\' (base64) is required')
    })

    test('should reject attachment with both content and path', async () => {
      console.log('📧 Testing conflicting content/path error')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Conflicting Content',
          text: 'This should fail due to both content and path provided.',
          attachments: [
            {
              content: SAMPLE_BASE64_PNG,
              path: 'https://httpbin.org/image/png',
              filename: 'conflicting-attachment.png'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('cannot specify both \'path\' and \'content\'')
    })

    test('should reject invalid base64 content', async () => {
      console.log('📧 Testing invalid base64 error')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Invalid Base64',
          text: 'This should fail due to invalid base64.',
          attachments: [
            {
              content: 'invalid-base64-content!@#$%',
              filename: 'invalid.txt'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('Invalid base64')
    })

    test('should reject invalid remote URL', async () => {
      console.log('📧 Testing invalid remote URL error')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Invalid URL',
          text: 'This should fail due to invalid URL.',
          attachments: [
            {
              path: 'not-a-valid-url',
              filename: 'invalid-remote.txt'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('Failed to fetch remote file')
    })

    test('should reject non-HTTP URLs', async () => {
      console.log('📧 Testing non-HTTP URL error')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Non-HTTP URL',
          text: 'This should fail due to non-HTTP URL.',
          attachments: [
            {
              path: 'ftp://example.com/file.txt',
              filename: 'ftp-file.txt'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('Only HTTP and HTTPS URLs are supported')
    })
  })

  describe('📧 Reply with Attachments Tests', () => {
    
    let testEmailId: string

    test('should create a test email to reply to', async () => {
      console.log('📧 Creating test email for reply tests')
      
      // First, we need to create a test email in the system
      // This would typically come from an inbound email, but for testing we'll simulate it
      // Note: This test assumes you have a way to create test emails in your system
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Original Email for Reply Test',
          text: 'This is the original email that we will reply to.',
        })
      })

      expect(response.status).toBe(200)
      testEmailId = data.id
      console.log('✅ Created test email with ID:', testEmailId)
    })

    test('should reply with base64 attachment', async () => {
      console.log('📧 Testing reply with base64 attachment')
      
      if (!testEmailId) {
        console.log('⚠️ Skipping reply test - no test email ID available')
        return
      }
      
      const { response, data } = await apiRequest(`/emails/${testEmailId}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          text: 'This is a reply with an attachment.',
          html: '<p>This is a <strong>reply</strong> with an attachment.</p>',
          attachments: [
            {
              content: SAMPLE_BASE64_PNG,
              filename: 'reply-attachment.png',
              contentType: 'image/png'
            }
          ]
        })
      })

      console.log('📊 Reply response status:', response.status)
      console.log('📊 Reply response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('messageId')
      expect(data).toHaveProperty('awsMessageId')
    })

    test('should reply with remote file attachment', async () => {
      console.log('📧 Testing reply with remote file attachment')
      
      if (!testEmailId) {
        console.log('⚠️ Skipping reply test - no test email ID available')
        return
      }
      
      const { response, data } = await apiRequest(`/emails/${testEmailId}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          text: 'This is a reply with a remote file attachment.',
          attachments: [
            {
              path: 'https://httpbin.org/image/png',
              filename: 'reply-remote.png'
            }
          ]
        })
      })

      console.log('📊 Reply response status:', response.status)
      console.log('📊 Reply response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
    })
  })

  describe('🔄 Idempotency Tests', () => {
    
    test('should handle idempotent requests with attachments', async () => {
      console.log('📧 Testing idempotency with attachments')
      
      const idempotencyKey = `test-${Date.now()}-${Math.random()}`
      const emailData = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'Idempotency Test with Attachment',
        text: 'Testing idempotency with attachment.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'idempotent-test.png',
            contentType: 'image/png'
          }
        ]
      }

      // First request
      const { response: response1, data: data1 } = await apiRequest('/emails', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(emailData)
      })

      console.log('📊 First request status:', response1.status)
      console.log('📊 First request data:', data1)

      expect(response1.status).toBe(200)
      expect(data1).toHaveProperty('id')

      // Second request with same idempotency key
      const { response: response2, data: data2 } = await apiRequest('/emails', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(emailData)
      })

      console.log('📊 Second request status:', response2.status)
      console.log('📊 Second request data:', data2)

      expect(response2.status).toBe(200)
      expect(data2.id).toBe(data1.id) // Should return the same email ID
    })
  })

  describe('📏 Size Limit Tests', () => {
    
    test('should reject oversized single attachment (over 25MB)', async () => {
      console.log('📧 Testing oversized single attachment rejection')
      
      // Create a large base64 string (over 25MB limit per attachment)
      const largeContent = 'A'.repeat(30 * 1024 * 1024) // 30MB of 'A' characters
      const largeBase64 = Buffer.from(largeContent).toString('base64')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Oversized Single Attachment',
          text: 'This should fail due to oversized single attachment.',
          attachments: [
            {
              content: largeBase64,
              filename: 'oversized-file.txt'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('File too large')
    })

    test('should reject total email size over 40MB', async () => {
      console.log('📧 Testing total email size limit (40MB)')
      
      // Create multiple attachments that together exceed 40MB
      const mediumContent = 'B'.repeat(15 * 1024 * 1024) // 15MB each
      const mediumBase64 = Buffer.from(mediumContent).toString('base64')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Total Size Limit',
          text: 'This should fail due to total email size exceeding 40MB.',
          attachments: [
            {
              content: mediumBase64,
              filename: 'file1.txt',
              contentType: 'text/plain'
            },
            {
              content: mediumBase64,
              filename: 'file2.txt',
              contentType: 'text/plain'
            },
            {
              content: mediumBase64,
              filename: 'file3.txt',
              contentType: 'text/plain'
            }
            // 3 x 15MB = 45MB total (over 40MB limit)
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('Total email size too large')
      expect(data.error).toContain('40MB')
    })

    test('should reject too many attachments', async () => {
      console.log('📧 Testing attachment count limit')
      
      const smallContent = Buffer.from('Small file content').toString('base64')
      
      // Create 25 attachments (over the 20 limit)
      const attachments = Array.from({ length: 25 }, (_, i) => ({
        content: smallContent,
        filename: `file${i + 1}.txt`,
        contentType: 'text/plain'
      }))
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Too Many Attachments',
          text: 'This should fail due to too many attachments.',
          attachments
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('Too many attachments')
      expect(data.error).toContain('max: 20')
    })
  })

  describe('🏷️ Content Type Tests', () => {
    
    test('should handle various safe content types', async () => {
      console.log('📧 Testing various safe content types')
      
      const textContent = Buffer.from('Hello, World!').toString('base64')
      const jsonContent = Buffer.from('{"test": "data"}').toString('base64')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Various Content Types',
          text: 'Testing various attachment content types.',
          attachments: [
            {
              content: textContent,
              filename: 'text-file.txt',
              contentType: 'text/plain'
            },
            {
              content: jsonContent,
              filename: 'data.json',
              contentType: 'application/json'
            },
            {
              content: SAMPLE_BASE64_PNG,
              filename: 'image.png',
              contentType: 'image/png'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
    })

    test('should reject executable file types', async () => {
      console.log('📧 Testing executable file rejection')
      
      const execContent = Buffer.from('fake executable content').toString('base64')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Executable Rejection',
          text: 'This should fail due to executable file type.',
          attachments: [
            {
              content: execContent,
              filename: 'malicious.exe',
              contentType: 'application/x-msdownload'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('not allowed for security reasons')
    })

    test('should reject dangerous file extensions', async () => {
      console.log('📧 Testing dangerous file extension rejection')
      
      const scriptContent = Buffer.from('echo "hello"').toString('base64')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Script Extension Rejection',
          text: 'This should fail due to dangerous file extension.',
          attachments: [
            {
              content: scriptContent,
              filename: 'script.bat',
              contentType: 'text/plain' // Even with safe content type, extension should be blocked
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('File extension \'.bat\' is not allowed for security reasons')
    })

    test('should reject unsupported file types', async () => {
      console.log('📧 Testing unsupported file type rejection')
      
      const unknownContent = Buffer.from('unknown file content').toString('base64')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Unsupported File Type',
          text: 'This should fail due to unsupported file type.',
          attachments: [
            {
              content: unknownContent,
              filename: 'file.xyz',
              contentType: 'application/x-custom-unknown-type'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data.error).toContain('is not supported')
      expect(data.error).toContain('Please use a common document, image, text, or archive format')
    })

    test('should allow common document formats', async () => {
      console.log('📧 Testing common document formats')
      
      const docContent = Buffer.from('Document content').toString('base64')
      
      const { response, data } = await apiRequest('/emails', {
        method: 'POST',
        body: JSON.stringify({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'Test Document Formats',
          text: 'Testing common document formats.',
          attachments: [
            {
              content: docContent,
              filename: 'document.pdf',
              contentType: 'application/pdf'
            },
            {
              content: docContent,
              filename: 'spreadsheet.xlsx',
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            },
            {
              content: docContent,
              filename: 'presentation.pptx',
              contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            }
          ]
        })
      })

      console.log('📊 Response status:', response.status)
      console.log('📊 Response data:', data)

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('id')
    })
  })
})

// Helper function to run specific test suites
export function runAttachmentTests() {
  console.log('🚀 Running comprehensive attachment tests...')
  console.log('📋 Test configuration:')
  console.log('  - Base64 attachments: ✅')
  console.log('  - Remote file attachments: ✅')
  console.log('  - Error handling: ✅')
  console.log('  - Reply attachments: ✅')
  console.log('  - Idempotency: ✅')
  console.log('  - Size limits: ✅')
  console.log('  - Content types: ✅')
}
