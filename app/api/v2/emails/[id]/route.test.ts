import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { db } from '@/lib/db'
import { structuredEmails, sentEmails, user, apikey } from '@/lib/db/schema'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

/**
 * Tests for GET /api/v2/emails/{id}
 * Tests both inbound and outbound email retrieval
 */

// Test data
const testUserId = `test-user-${nanoid()}`
const testInboundEmailId = `inbnd_${nanoid()}`
const testOutboundEmailId = `outbd_${nanoid()}`
const testApiKey = `test_${nanoid()}`

// Helper function to make API requests
async function apiRequest(path: string, options?: RequestInit) {
  const response = await fetch(`http://localhost:3000${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${testApiKey}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const data = await response.json()
  return { response, data }
}

describe('GET /api/v2/emails/[id]', () => {
  beforeAll(async () => {
    // Create test user
    await db.insert(user).values({
      id: testUserId,
      email: `test-${nanoid()}@example.com`,
      name: 'Test User',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create API key
    await db.insert(apikey).values({
      id: nanoid(),
      userId: testUserId,
      name: 'Test API Key',
      key: testApiKey,
      expiresAt: new Date(Date.now() + 86400000), // 24 hours
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create test inbound email
    await db.insert(structuredEmails).values({
      id: testInboundEmailId,
      emailId: testInboundEmailId,
      sesEventId: nanoid(),
      userId: testUserId,
      recipient: 'test@example.com',
      messageId: '<test-message-id@example.com>',
      subject: 'Test Inbound Email',
      fromData: JSON.stringify({
        text: 'sender@example.com',
        addresses: [{ name: 'Sender Name', address: 'sender@example.com' }],
      }),
      toData: JSON.stringify({
        text: 'test@example.com',
        addresses: [{ name: null, address: 'test@example.com' }],
      }),
      textBody: 'This is a test inbound email',
      htmlBody: '<p>This is a test inbound email</p>',
      attachments: JSON.stringify([]),
      headers: JSON.stringify({
        'From': 'sender@example.com',
        'To': 'test@example.com',
        'Subject': 'Test Inbound Email',
      }),
      date: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create test outbound email
    await db.insert(sentEmails).values({
      id: testOutboundEmailId,
      userId: testUserId,
      from: 'test@example.com',
      fromAddress: 'test@example.com',
      fromDomain: 'example.com',
      to: JSON.stringify(['recipient@example.com']),
      subject: 'Test Outbound Email',
      textBody: 'This is a test outbound email',
      htmlBody: '<p>This is a test outbound email</p>',
      status: 'sent',
      messageId: '<sent-message-id@example.com>',
      sentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  afterAll(async () => {
    // Clean up test data
    await db.delete(structuredEmails).where(eq(structuredEmails.id, testInboundEmailId))
    await db.delete(sentEmails).where(eq(sentEmails.id, testOutboundEmailId))
    await db.delete(apikey).where(eq(apikey.key, testApiKey))
    await db.delete(user).where(eq(user.id, testUserId))
  })

  describe('Inbound Email Retrieval', () => {
    it('should retrieve inbound email by ID', async () => {
      const { response, data } = await apiRequest(`/api/v2/emails/${testInboundEmailId}`)

      expect(response.status).toBe(200)
      expect(data.object).toBe('email')
      expect(data.direction).toBe('inbound')
      expect(data.id).toBe(testInboundEmailId)
      expect(data.subject).toBe('Test Inbound Email')
      expect(data.messageId).toBe('<test-message-id@example.com>')
      expect(data.body.text).toBe('This is a test inbound email')
      expect(data.body.html).toBe('<p>This is a test inbound email</p>')
      expect(data.recipient).toBe('test@example.com')
      expect(data.from).toBeTruthy()
      expect(data.from.addresses[0].address).toBe('sender@example.com')
    })

    it('should return 404 for non-existent inbound email', async () => {
      const { response, data } = await apiRequest(`/api/v2/emails/inbnd_nonexistent`)

      expect(response.status).toBe(404)
      expect(data.error).toBe('Email not found')
    })
  })

  describe('Outbound Email Retrieval', () => {
    it('should retrieve outbound email by ID', async () => {
      const { response, data } = await apiRequest(`/api/v2/emails/${testOutboundEmailId}`)

      expect(response.status).toBe(200)
      expect(data.object).toBe('email')
      expect(data.direction).toBe('outbound')
      expect(data.id).toBe(testOutboundEmailId)
      expect(data.subject).toBe('Test Outbound Email')
      expect(data.from).toBe('test@example.com')
      expect(data.to).toContain('recipient@example.com')
      expect(data.text).toBe('This is a test outbound email')
      expect(data.html).toBe('<p>This is a test outbound email</p>')
      expect(data.status).toBe('sent')
      expect(data.last_event).toBe('delivered')
    })

    it('should return 404 for non-existent outbound email', async () => {
      const { response, data } = await apiRequest(`/api/v2/emails/outbd_nonexistent`)

      expect(response.status).toBe(404)
      expect(data.error).toBe('Email not found')
    })
  })

  describe('Authentication', () => {
    it('should return 401 without authentication', async () => {
      const response = await fetch(`http://localhost:3000/api/v2/emails/${testInboundEmailId}`)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBeTruthy()
    })

    it('should not allow accessing other users emails', async () => {
      // Create another API key for a different user
      const otherUserId = `test-user-${nanoid()}`
      const otherApiKey = `test_${nanoid()}`

      await db.insert(user).values({
        id: otherUserId,
        email: `other-${nanoid()}@example.com`,
        name: 'Other User',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await db.insert(apikey).values({
        id: nanoid(),
        userId: otherUserId,
        name: 'Other API Key',
        key: otherApiKey,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Try to access test user's email with other user's API key
      const { response, data } = await apiRequest(`/api/v2/emails/${testInboundEmailId}`, {
        headers: {
          'Authorization': `Bearer ${otherApiKey}`,
          'Content-Type': 'application/json',
        },
      })

      expect(response.status).toBe(404)
      expect(data.error).toBe('Email not found')

      // Clean up
      await db.delete(apikey).where(eq(apikey.key, otherApiKey))
      await db.delete(user).where(eq(user.id, otherUserId))
    })
  })

  describe('Response Format', () => {
    it('should have correct inbound email response structure', async () => {
      const { response, data } = await apiRequest(`/api/v2/emails/${testInboundEmailId}`)

      expect(response.status).toBe(200)
      
      // Check all required inbound fields
      expect(data).toHaveProperty('object')
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('direction')
      expect(data).toHaveProperty('created_at')
      expect(data).toHaveProperty('messageId')
      expect(data).toHaveProperty('from')
      expect(data).toHaveProperty('to')
      expect(data).toHaveProperty('subject')
      expect(data).toHaveProperty('body')
      expect(data.body).toHaveProperty('text')
      expect(data.body).toHaveProperty('html')
      expect(data).toHaveProperty('attachments')
      expect(data).toHaveProperty('headers')
      expect(data).toHaveProperty('recipient')
      expect(data).toHaveProperty('is_read')
    })

    it('should have correct outbound email response structure', async () => {
      const { response, data } = await apiRequest(`/api/v2/emails/${testOutboundEmailId}`)

      expect(response.status).toBe(200)
      
      // Check all required outbound fields
      expect(data).toHaveProperty('object')
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('direction')
      expect(data).toHaveProperty('created_at')
      expect(data).toHaveProperty('from')
      expect(data).toHaveProperty('to')
      expect(data).toHaveProperty('subject')
      expect(data).toHaveProperty('text')
      expect(data).toHaveProperty('html')
      expect(data).toHaveProperty('cc')
      expect(data).toHaveProperty('bcc')
      expect(data).toHaveProperty('reply_to')
      expect(data).toHaveProperty('status')
      expect(data).toHaveProperty('last_event')
      expect(data).toHaveProperty('sent_at')
    })
  })
})
