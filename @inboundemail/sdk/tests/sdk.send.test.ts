/**
 * Comprehensive tests for Inbound Email SDK email sending with attachments
 * Tests both remote file attachments (path) and base64 attachments (content)
 * Mirrors the v2 API test structure but uses the SDK client
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import fs from 'fs'
import { Inbound } from '../src/index'
import type { 
  PostEmailsRequest, 
  PostEmailsResponse, 
  PostEmailReplyRequest,
  PostEmailReplyResponse,
  AttachmentData,
  ApiResponse
} from '../src/types'

// Test configuration
const TEST_API_KEY = "uHpoGGrqCpinyLltyiOAkqKsqzOuTbyoxnueruOyUQpfuQDJefSHSdQlsIghaHIH"
const TEST_FROM_EMAIL = 'India Bound <agent@inbnd.dev>'
const TEST_TO_EMAIL = 'John Doe <inboundemaildotnew@gmail.com>'
const API_BASE_URL = 'http://localhost:3000'

// Initialize SDK client
const inbound = new Inbound(TEST_API_KEY, `${API_BASE_URL}/api/v2`)

// Sample base64 content for testing (small PNG image)
const SAMPLE_BASE64_PNG = fs.readFileSync('/Users/ryanvogel/devlocal/inbound/inbound-app/app/api/v2/testing/jpegimage.jpeg', 'base64')

// Sample STL file content
const SAMPLE_BASE64_STL = fs.readFileSync('/Users/ryanvogel/devlocal/inbound/inbound-app/app/api/v2/testing/randomstlfile.stl', 'base64')

describe('Inbound Email SDK - Email Sending with Attachments', () => {
  
  beforeAll(() => {
    console.log('🧪 Starting SDK attachment tests with configuration:')
    console.log('  API Base URL:', API_BASE_URL)
    console.log('  From Email:', TEST_FROM_EMAIL)
    console.log('  To Email:', TEST_TO_EMAIL)
    console.log('  SDK Version:', '3.1.0')
  })

  describe('📎 Base64 Attachment Tests', () => {
    
    test('should send email with single base64 attachment', async () => {
      console.log('📧 Testing single base64 attachment via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Single Base64 Attachment',
        text: 'This email contains a base64 encoded PNG attachment sent via SDK.',
        html: '<p>This email contains a <strong>base64 encoded PNG</strong> attachment sent via <em>SDK</em>.</p>',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-test-image.png',
            contentType: 'image/png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('messageId')
      expect(typeof data.id).toBe('string')
      expect(data.id.length).toBeGreaterThan(0)
    })

    test('should send email with multiple base64 attachments', async () => {
      console.log('📧 Testing multiple base64 attachments via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Multiple Base64 Attachments',
        text: 'This email contains multiple base64 encoded attachments sent via SDK.',
        html: '<p>This email contains <strong>multiple base64 encoded</strong> attachments sent via <em>SDK</em>.</p>',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-image1.png',
            contentType: 'image/png'
          },
          {
            content: Buffer.from('Sample document content').toString('base64'),
            filename: 'sdk-document.txt',
            contentType: 'text/plain'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('messageId')
    })

    test('should auto-detect content type from base64 content', async () => {
      console.log('📧 Testing content type auto-detection via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Auto Content Type Detection',
        text: 'Testing automatic content type detection from base64 via SDK.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-auto-detect.png'
            // No contentType specified - should auto-detect as image/png
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })
  })

  describe('🌐 Remote File Attachment Tests', () => {
    
    test('should send email with remote file attachment', async () => {
      console.log('📧 Testing remote file attachment via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Remote File Attachment',
        text: 'This email contains a remote file attachment sent via SDK.',
        html: '<p>This email contains a <strong>remote file</strong> attachment sent via <em>SDK</em>.</p>',
        attachments: [
          {
            path: 'https://httpbin.org/image/png',
            filename: 'sdk-remote-image.png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('messageId')
    })

    test('should handle remote file with explicit content type', async () => {
      console.log('📧 Testing remote file with explicit content type via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Remote File with Content Type',
        text: 'Testing remote file with explicit content type via SDK.',
        attachments: [
          {
            path: 'https://httpbin.org/image/jpeg',
            filename: 'sdk-remote-photo.jpg',
            contentType: 'image/jpeg'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should handle mixed remote and base64 attachments', async () => {
      console.log('📧 Testing mixed remote and base64 attachments via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Mixed Attachment Types',
        text: 'This email has both remote and base64 attachments sent via SDK.',
        html: '<p>This email has both <strong>remote</strong> and <strong>base64</strong> attachments sent via <em>SDK</em>.</p>',
        attachments: [
          {
            path: 'https://httpbin.org/image/png',
            filename: 'sdk-remote-file.png'
          },
          {
            content: Buffer.from('Local document content').toString('base64'),
            filename: 'sdk-local-document.txt',
            contentType: 'text/plain'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })
  })

  describe('❌ Error Handling Tests', () => {
    
    test('should reject attachment without filename', async () => {
      console.log('📧 Testing missing filename error via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Missing Filename',
        text: 'This should fail due to missing filename.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG
            // Missing filename
          } as AttachmentData
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('filename is required')
    })

    test('should reject attachment without content or path', async () => {
      console.log('📧 Testing missing content/path error via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Missing Content',
        text: 'This should fail due to missing content and path.',
        attachments: [
          {
            filename: 'sdk-empty-attachment.txt'
            // Missing both content and path
          } as AttachmentData
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('either \'path\' (remote URL) or \'content\' (base64) is required')
    })

    test('should reject attachment with both content and path', async () => {
      console.log('📧 Testing conflicting content/path error via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Conflicting Content',
        text: 'This should fail due to both content and path provided.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            path: 'https://httpbin.org/image/png',
            filename: 'sdk-conflicting-attachment.png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('cannot specify both \'path\' and \'content\'')
    })

    test('should reject invalid base64 content', async () => {
      console.log('📧 Testing invalid base64 error via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Invalid Base64',
        text: 'This should fail due to invalid base64.',
        attachments: [
          {
            content: 'invalid-base64-content!@#$%',
            filename: 'sdk-invalid.txt'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Invalid base64')
    })

    test('should reject invalid remote URL', async () => {
      console.log('📧 Testing invalid remote URL error via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Invalid URL',
        text: 'This should fail due to invalid URL.',
        attachments: [
          {
            path: 'not-a-valid-url',
            filename: 'sdk-invalid-remote.txt'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Failed to fetch remote file')
    })

    test('should reject non-HTTP URLs', async () => {
      console.log('📧 Testing non-HTTP URL error via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Non-HTTP URL',
        text: 'This should fail due to non-HTTP URL.',
        attachments: [
          {
            path: 'ftp://example.com/file.txt',
            filename: 'sdk-ftp-file.txt'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Only HTTP and HTTPS URLs are supported')
    })

    test('should handle unauthorized domain error', async () => {
      console.log('📧 Testing unauthorized domain error via SDK')
      
      const emailData: PostEmailsRequest = {
        from: 'test@unauthorized-domain.com',
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Unauthorized Domain',
        text: 'This should fail due to unauthorized domain.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-unauthorized.png',
            contentType: 'image/png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('don\'t have permission to send from domain')
    })
  })

  describe('📧 Reply with Attachments Tests', () => {
    
    test('should handle reply to non-existent email', async () => {
      console.log('📧 Testing reply to non-existent email via SDK')
      
      const replyData: PostEmailReplyRequest = {
        from: TEST_FROM_EMAIL,
        text: 'This is a reply to a non-existent email.'
      }

      const response = await inbound.emails.reply('non-existent-id', replyData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Email not found')
    })

    test('should validate reply request structure with attachments', async () => {
      console.log('📧 Testing reply request validation with attachments via SDK')
      
      // Test that the SDK properly structures reply requests with attachments
      const replyData: PostEmailReplyRequest = {
        from: TEST_FROM_EMAIL,
        to: ['custom@example.com'],
        cc: ['cc@example.com'],
        subject: 'Custom Reply Subject',
        text: 'This is a custom reply with attachment.',
        html: '<p>This is a <strong>custom reply</strong> with attachment.</p>',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-reply-test.png',
            contentType: 'image/png'
          }
        ],
        includeOriginal: false
      }

      // This will fail because the email doesn't exist, but we can validate the request structure
      const response = await inbound.emails.reply('test-email-id', replyData)
      
      console.log('📊 SDK Reply Validation Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Email not found')
    })

    test('should handle missing from address in reply', async () => {
      console.log('📧 Testing missing from address in reply via SDK')
      
      const replyData = {
        text: 'This reply is missing a from address.'
        // Missing from field
      } as PostEmailReplyRequest

      const response = await inbound.reply('test-email-id', replyData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Reply requires a "from" address')
    })
  })

  describe('📏 Size Limit Tests', () => {
    
    test('should reject oversized single attachment (over 25MB)', async () => {
      console.log('📧 Testing oversized single attachment rejection via SDK')
      
      // Create a large base64 string (over 25MB limit per attachment)
      const largeContent = 'A'.repeat(30 * 1024 * 1024) // 30MB of 'A' characters
      const largeBase64 = Buffer.from(largeContent).toString('base64')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Oversized Single Attachment',
        text: 'This should fail due to oversized single attachment.',
        attachments: [
          {
            content: largeBase64,
            filename: 'sdk-oversized-file.txt'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      // Should contain either the specific error message or a generic 400 error
      expect(
        response.error?.includes('File too large') || 
        response.error?.includes('HTTP 400') ||
        response.error?.includes('Bad Request')
      ).toBe(true)
    })

    test('should reject total email size over 40MB', async () => {
      console.log('📧 Testing total email size limit (40MB) via SDK')
      
      // Create multiple attachments that together exceed 40MB
      const mediumContent = 'B'.repeat(15 * 1024 * 1024) // 15MB each
      const mediumBase64 = Buffer.from(mediumContent).toString('base64')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Total Size Limit',
        text: 'This should fail due to total email size exceeding 40MB.',
        attachments: [
          {
            content: mediumBase64,
            filename: 'sdk-file1.txt',
            contentType: 'text/plain'
          },
          {
            content: mediumBase64,
            filename: 'sdk-file2.txt',
            contentType: 'text/plain'
          },
          {
            content: mediumBase64,
            filename: 'sdk-file3.txt',
            contentType: 'text/plain'
          }
          // 3 x 15MB = 45MB total (over 40MB limit)
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Total email size too large')
      expect(response.error).toContain('40MB')
    })

    test('should reject too many attachments', async () => {
      console.log('📧 Testing attachment count limit via SDK')
      
      const smallContent = Buffer.from('Small file content').toString('base64')
      
      // Create 25 attachments (over the 20 limit)
      const attachments: AttachmentData[] = Array.from({ length: 25 }, (_, i) => ({
        content: smallContent,
        filename: `sdk-file${i + 1}.txt`,
        contentType: 'text/plain'
      }))
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Too Many Attachments',
        text: 'This should fail due to too many attachments.',
        attachments
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Too many attachments')
      expect(response.error).toContain('max: 20')
    })
  })

  describe('🏷️ Content Type Tests', () => {
    
    test('should handle various safe content types', async () => {
      console.log('📧 Testing various safe content types via SDK')
      
      const textContent = Buffer.from('Hello, World!').toString('base64')
      const jsonContent = Buffer.from('{"test": "data"}').toString('base64')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Various Content Types',
        text: 'Testing various attachment content types via SDK.',
        attachments: [
          {
            content: textContent,
            filename: 'sdk-text-file.txt',
            contentType: 'text/plain'
          },
          {
            content: jsonContent,
            filename: 'sdk-data.json',
            contentType: 'application/json'
          },
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-image.png',
            contentType: 'image/png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should reject executable file types', async () => {
      console.log('📧 Testing executable file rejection via SDK')
      
      const execContent = Buffer.from('fake executable content').toString('base64')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Executable Rejection',
        text: 'This should fail due to executable file type.',
        attachments: [
          {
            content: execContent,
            filename: 'sdk-malicious.exe',
            contentType: 'application/x-msdownload'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('not allowed for security reasons')
    })

    test('should reject dangerous file extensions', async () => {
      console.log('📧 Testing dangerous file extension rejection via SDK')
      
      const scriptContent = Buffer.from('echo "hello"').toString('base64')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Script Extension Rejection',
        text: 'This should fail due to dangerous file extension.',
        attachments: [
          {
            content: scriptContent,
            filename: 'sdk-script.bat',
            contentType: 'text/plain' // Even with safe content type, extension should be blocked
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('File extension \'.bat\' is not allowed for security reasons')
    })

    test('should allow common document formats', async () => {
      console.log('📧 Testing common document formats via SDK')
      
      const docContent = Buffer.from('Document content').toString('base64')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Document Formats',
        text: 'Testing common document formats via SDK.',
        attachments: [
          {
            content: docContent,
            filename: 'sdk-document.pdf',
            contentType: 'application/pdf'
          },
          {
            content: docContent,
            filename: 'sdk-spreadsheet.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          },
          {
            content: docContent,
            filename: 'sdk-presentation.pptx',
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })
  })

  describe('🖼️ CID Image Embedding Tests', () => {
    /**
     * CID (Content-ID) Image Embedding allows you to embed images directly in HTML emails
     * instead of linking to external URLs. This ensures images display even when external
     * images are blocked by email clients.
     * 
     * How it works:
     * 1. Add content_id to your attachment (e.g., "company-logo")
     * 2. Reference it in HTML using cid: prefix: <img src="cid:company-logo" />
     * 3. The image will be embedded inline in the email
     * 
     * Benefits:
     * - Images always display (no external blocking)
     * - Better email client compatibility
     * - Professional appearance
     * - Works with both base64 and remote file attachments
     */
    
    test('should embed single image using content_id', async () => {
      console.log('📧 Testing CID image embedding via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - CID Image Embedding',
        html: `
          <div>
            <h1>Welcome to our newsletter!</h1>
            <p>Check out our company logo:</p>
            <img src="cid:company-logo" alt="Company Logo" style="width: 200px;" />
            <p>Thanks for subscribing!</p>
          </div>
        `,
        text: 'Welcome to our newsletter! Thanks for subscribing!',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'company-logo.png',
            contentType: 'image/png',
            content_id: 'company-logo'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK CID Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
      expect(typeof data.id).toBe('string')
      expect(data.id.length).toBeGreaterThan(0)
    })

    test('should embed multiple images using different content_ids', async () => {
      console.log('📧 Testing multiple CID images via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Multiple CID Images',
        html: `
          <div>
            <h1>Product Showcase</h1>
            <div style="display: flex; gap: 20px;">
              <div>
                <h3>Product A</h3>
                <img src="cid:product-a" alt="Product A" style="width: 150px;" />
              </div>
              <div>
                <h3>Product B</h3>
                <img src="cid:product-b" alt="Product B" style="width: 150px;" />
              </div>
            </div>
            <p>Footer logo: <img src="cid:footer-logo" alt="Footer" style="width: 100px;" /></p>
          </div>
        `,
        text: 'Product Showcase - Check out our latest products!',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'product-a.png',
            contentType: 'image/png',
            content_id: 'product-a'
          },
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'product-b.png',
            contentType: 'image/png',
            content_id: 'product-b'
          },
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'footer-logo.png',
            contentType: 'image/png',
            content_id: 'footer-logo'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Multiple CID Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should handle mixed CID and regular attachments', async () => {
      console.log('📧 Testing mixed CID and regular attachments via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Mixed CID and Regular Attachments',
        html: `
          <div>
            <h1>Monthly Report</h1>
            <p>Here's our company logo:</p>
            <img src="cid:header-logo" alt="Header Logo" style="width: 200px;" />
            <p>Please find the detailed report attached as a PDF file.</p>
            <p>Best regards,<br>The Team</p>
          </div>
        `,
        text: 'Monthly Report - Please find the detailed report attached.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'header-logo.png',
            contentType: 'image/png',
            content_id: 'header-logo'
          },
          {
            content: Buffer.from('Sample PDF content').toString('base64'),
            filename: 'monthly-report.pdf',
            contentType: 'application/pdf'
            // No content_id - this is a regular attachment
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Mixed Attachments Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should handle CID with remote file attachments', async () => {
      console.log('📧 Testing CID with remote file via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - CID with Remote File',
        html: `
          <div>
            <h1>Remote Image Embedding</h1>
            <p>This image is loaded from a remote URL:</p>
            <img src="cid:remote-image" alt="Remote Image" style="width: 200px;" />
            <p>Pretty cool, right?</p>
          </div>
        `,
        text: 'Remote Image Embedding - Check out this remote image!',
        attachments: [
          {
            path: 'https://httpbin.org/image/png',
            filename: 'remote-image.png',
            content_id: 'remote-image'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Remote CID Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should validate content_id length limit', async () => {
      console.log('📧 Testing content_id length validation via SDK')
      
      // Create a content_id longer than 128 characters
      const longContentId = 'a'.repeat(129)
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Long Content ID',
        html: `<p>This should fail: <img src="cid:${longContentId}" /></p>`,
        text: 'This should fail due to long content_id.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'test-image.png',
            contentType: 'image/png',
            content_id: longContentId
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Long Content ID Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('content_id must be less than 128 characters')
    })

    test('should handle duplicate content_ids', async () => {
      console.log('📧 Testing duplicate content_ids via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Duplicate Content IDs',
        html: `
          <div>
            <p>Image 1: <img src="cid:duplicate-id" /></p>
            <p>Image 2: <img src="cid:duplicate-id" /></p>
          </div>
        `,
        text: 'This should fail due to duplicate content_ids.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'image1.png',
            contentType: 'image/png',
            content_id: 'duplicate-id'
          },
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'image2.png',
            contentType: 'image/png',
            content_id: 'duplicate-id'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Duplicate Content ID Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Duplicate content_id')
    })

    test('should handle special characters in content_id', async () => {
      console.log('📧 Testing special characters in content_id via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Special Characters in Content ID',
        html: '<p>Image: <img src="cid:logo-image_2024" alt="Logo" /></p>',
        text: 'Testing special characters in content_id.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'logo.png',
            contentType: 'image/png',
            content_id: 'logo-image_2024'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Special Characters Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should handle CID in reply emails', async () => {
      console.log('📧 Testing CID in reply emails via SDK')
      
      const replyData: PostEmailReplyRequest = {
        from: TEST_FROM_EMAIL,
        html: `
          <div>
            <p>Thanks for your inquiry!</p>
            <p>Here's our signature logo:</p>
            <img src="cid:signature-logo" alt="Signature" style="width: 150px;" />
            <p>Best regards,<br>Support Team</p>
          </div>
        `,
        text: 'Thanks for your inquiry! Best regards, Support Team',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'signature-logo.png',
            contentType: 'image/png',
            content_id: 'signature-logo'
          }
        ]
      }

      // This will fail because the email doesn't exist, but we can validate the request structure
      const response = await inbound.emails.reply('test-email-id', replyData)
      
      console.log('📊 SDK Reply CID Response:', response)

      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(response.error).toContain('Email not found')
    })
  })

  describe('🔧 SDK-Specific Features', () => {
    
    test('should use legacy send method for backward compatibility', async () => {
      console.log('📧 Testing legacy send method via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Legacy Send Method',
        text: 'Testing legacy send method with attachment.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-legacy-test.png',
            contentType: 'image/png'
          }
        ]
      }

      const response = await inbound.send(emailData) // Using legacy method
      
      console.log('📊 SDK Legacy Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should handle multiple recipients with attachments', async () => {
      console.log('📧 Testing multiple recipients with attachments via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: [TEST_TO_EMAIL, 'test2@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'SDK Test - Multiple Recipients with Attachments',
        text: 'Testing multiple recipients with attachments via SDK.',
        html: '<p>Testing <strong>multiple recipients</strong> with attachments via <em>SDK</em>.</p>',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-multi-recipient.png',
            contentType: 'image/png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should handle custom headers with attachments', async () => {
      console.log('📧 Testing custom headers with attachments via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Custom Headers with Attachments',
        text: 'Testing custom headers with attachments via SDK.',
        headers: {
          'X-SDK-Test': 'true',
          'X-Custom-Header': 'attachment-test'
        },
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-custom-headers.png',
            contentType: 'image/png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })

    test('should handle tags with attachments', async () => {
      console.log('📧 Testing tags with attachments via SDK')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Tags with Attachments',
        text: 'Testing tags with attachments via SDK.',
        tags: [
          { name: 'category', value: 'test' },
          { name: 'source', value: 'sdk' },
          { name: 'has-attachment', value: 'true' }
        ],
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-tagged.png',
            contentType: 'image/png'
          }
        ]
      }

      const response = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response:', response)

      expect(response.error).toBeUndefined()
      expect(response.data).toBeDefined()
      
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
    })
  })

  describe('📊 SDK Response Validation', () => {
    
    test('should validate ApiResponse structure', async () => {
      console.log('📧 Testing SDK ApiResponse structure validation')
      
      const emailData: PostEmailsRequest = {
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Response Structure Validation',
        text: 'Testing SDK response structure validation.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-response-test.png',
            contentType: 'image/png'
          }
        ]
      }

      const response: ApiResponse<PostEmailsResponse> = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Response Structure:', response)

      // Validate ApiResponse structure
      expect(typeof response).toBe('object')
      expect(response).toHaveProperty('data')
      expect(response).not.toHaveProperty('error')
      
      // Validate success response
      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
      
      // Validate PostEmailsResponse structure
      const data = response.data as PostEmailsResponse
      expect(data).toHaveProperty('id')
      expect(typeof data.id).toBe('string')
    })

    test('should validate error response structure', async () => {
      console.log('📧 Testing SDK error response structure validation')
      
      const emailData: PostEmailsRequest = {
        from: 'invalid@unauthorized-domain.com',
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Error Response Structure',
        text: 'Testing SDK error response structure.',
        attachments: [
          {
            content: SAMPLE_BASE64_PNG,
            filename: 'sdk-error-test.png',
            contentType: 'image/png'
          }
        ]
      }

      const response: ApiResponse<PostEmailsResponse> = await inbound.emails.send(emailData)
      
      console.log('📊 SDK Error Response Structure:', response)

      // Validate ApiResponse structure for errors
      expect(typeof response).toBe('object')
      expect(response).toHaveProperty('error')
      expect(response).not.toHaveProperty('data')
      
      // Validate error response
      expect(response.error).toBeDefined()
      expect(response.data).toBeUndefined()
      expect(typeof response.error).toBe('string')
    })
  })
})

// Helper function to run specific test suites
export function runSDKAttachmentTests() {
  console.log('🚀 Running comprehensive SDK attachment tests...')
  console.log('📋 SDK Test configuration:')
  console.log('  - Base64 attachments: ✅')
  console.log('  - Remote file attachments: ✅')
  console.log('  - CID image embedding: ✅')
  console.log('  - Error handling: ✅')
  console.log('  - Reply attachments: ✅')
  console.log('  - Size limits: ✅')
  console.log('  - Content types: ✅')
  console.log('  - SDK-specific features: ✅')
  console.log('  - Response validation: ✅')
}

/**
 * CID Image Embedding Usage Examples
 * 
 * These examples demonstrate how to use Content-ID (CID) image embedding
 * with the Inbound Email SDK. CID embedding allows images to be displayed
 * inline in emails without relying on external URLs.
 */

// Example 1: Basic CID Image Embedding
export const cidBasicExample = {
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: 'Welcome Email with Logo',
  html: `
    <div style="font-family: Arial, sans-serif;">
      <h1>Welcome to Our Service!</h1>
      <img src="cid:company-logo" alt="Company Logo" style="width: 200px; margin: 20px 0;" />
      <p>Thank you for joining us. We're excited to have you on board!</p>
    </div>
  `,
  text: 'Welcome to Our Service! Thank you for joining us.',
  attachments: [
    {
      content: 'base64-encoded-image-data-here',
      filename: 'logo.png',
      contentType: 'image/png',
      content_id: 'company-logo'
    }
  ]
}

// Example 2: Multiple CID Images
export const cidMultipleExample = {
  from: 'newsletter@example.com',
  to: 'subscriber@example.com',
  subject: 'Product Showcase',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <header style="text-align: center; margin-bottom: 30px;">
        <img src="cid:header-logo" alt="Header Logo" style="width: 150px;" />
        <h1>New Product Showcase</h1>
      </header>
      
      <div style="display: flex; gap: 20px; margin-bottom: 30px;">
        <div style="flex: 1; text-align: center;">
          <h3>Product A</h3>
          <img src="cid:product-a" alt="Product A" style="width: 200px; border-radius: 8px;" />
          <p>Amazing features and great value!</p>
        </div>
        <div style="flex: 1; text-align: center;">
          <h3>Product B</h3>
          <img src="cid:product-b" alt="Product B" style="width: 200px; border-radius: 8px;" />
          <p>Premium quality and design!</p>
        </div>
      </div>
      
      <footer style="text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
        <img src="cid:footer-logo" alt="Footer Logo" style="width: 100px;" />
        <p style="color: #666; font-size: 12px;">© 2024 Your Company. All rights reserved.</p>
      </footer>
    </div>
  `,
  text: 'New Product Showcase - Check out our latest products!',
  attachments: [
    {
      content: 'header-logo-base64-data',
      filename: 'header-logo.png',
      contentType: 'image/png',
      content_id: 'header-logo'
    },
    {
      content: 'product-a-base64-data',
      filename: 'product-a.jpg',
      contentType: 'image/jpeg',
      content_id: 'product-a'
    },
    {
      content: 'product-b-base64-data',
      filename: 'product-b.jpg',
      contentType: 'image/jpeg',
      content_id: 'product-b'
    },
    {
      content: 'footer-logo-base64-data',
      filename: 'footer-logo.png',
      contentType: 'image/png',
      content_id: 'footer-logo'
    }
  ]
}

// Example 3: Mixed CID and Regular Attachments
export const cidMixedExample = {
  from: 'reports@example.com',
  to: 'manager@example.com',
  subject: 'Monthly Report - January 2024',
  html: `
    <div style="font-family: Arial, sans-serif;">
      <header style="text-align: center; margin-bottom: 30px;">
        <img src="cid:company-letterhead" alt="Company Letterhead" style="width: 300px;" />
      </header>
      
      <h2>Monthly Report - January 2024</h2>
      
      <p>Dear Team,</p>
      
      <p>Please find attached our comprehensive monthly report for January 2024. 
         The report includes detailed analytics and performance metrics.</p>
      
      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px;">
        <h3>Key Highlights</h3>
        <img src="cid:chart-summary" alt="Performance Chart" style="width: 100%; max-width: 400px;" />
      </div>
      
      <p>For detailed information, please refer to the attached PDF report.</p>
      
      <p>Best regards,<br>
         <img src="cid:signature" alt="Signature" style="width: 150px; margin: 10px 0;" /><br>
         Analytics Team</p>
    </div>
  `,
  text: 'Monthly Report - January 2024. Please find the detailed report attached.',
  attachments: [
    // CID images (embedded in HTML)
    {
      content: 'letterhead-base64-data',
      filename: 'letterhead.png',
      contentType: 'image/png',
      content_id: 'company-letterhead'
    },
    {
      content: 'chart-base64-data',
      filename: 'performance-chart.png',
      contentType: 'image/png',
      content_id: 'chart-summary'
    },
    {
      content: 'signature-base64-data',
      filename: 'signature.png',
      contentType: 'image/png',
      content_id: 'signature'
    },
    // Regular attachment (downloadable)
    {
      content: 'pdf-report-base64-data',
      filename: 'monthly-report-january-2024.pdf',
      contentType: 'application/pdf'
      // No content_id - this will be a downloadable attachment
    }
  ]
}

// Example 4: CID with Remote Files
export const cidRemoteExample = {
  from: 'marketing@example.com',
  to: 'customer@example.com',
  subject: 'Special Offer Just for You!',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <div style="text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 8px;">
        <img src="cid:promo-banner" alt="Special Offer" style="width: 100%; max-width: 400px; border-radius: 8px;" />
        <h1 style="margin: 20px 0;">50% Off Everything!</h1>
        <p style="font-size: 18px;">Limited time offer - Don't miss out!</p>
      </div>
      
      <div style="padding: 30px; text-align: center;">
        <img src="cid:product-grid" alt="Featured Products" style="width: 100%; max-width: 500px; border-radius: 8px;" />
        <p style="margin: 20px 0; font-size: 16px;">Shop now and save big on all your favorite items!</p>
        <a href="#" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Shop Now</a>
      </div>
    </div>
  `,
  text: 'Special Offer - 50% Off Everything! Limited time offer.',
  attachments: [
    {
      path: 'https://example.com/images/promo-banner.jpg',
      filename: 'promo-banner.jpg',
      content_id: 'promo-banner'
    },
    {
      path: 'https://example.com/images/product-grid.jpg',
      filename: 'product-grid.jpg',
      content_id: 'product-grid'
    }
  ]
}
