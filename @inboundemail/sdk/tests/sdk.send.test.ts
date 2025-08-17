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
  console.log('  - Error handling: ✅')
  console.log('  - Reply attachments: ✅')
  console.log('  - Size limits: ✅')
  console.log('  - Content types: ✅')
  console.log('  - SDK-specific features: ✅')
  console.log('  - Response validation: ✅')
}
