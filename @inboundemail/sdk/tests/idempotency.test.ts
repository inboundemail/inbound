/**
 * Test idempotency key functionality
 */

import { afterEach, jest } from 'bun:test'
import { InboundEmailClient } from '../src/client'

describe('Idempotency Key Support', () => {
  let client: InboundEmailClient
  let mockFetch: jest.Mock

  beforeEach(() => {
    client = new InboundEmailClient('test-api-key', 'http://localhost:3000/api/v2')
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should include Idempotency-Key header when provided in email.send()', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123', messageId: 'msg-456' })
    })

    await client.email.send({
      from: 'test@example.com',
      to: 'user@example.com',
      subject: 'Test Email',
      text: 'Test message'
    }, {
      idempotencyKey: 'unique-key-123'
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v2/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': 'unique-key-123'
        })
      })
    )
  })

  test('should include Idempotency-Key header when provided in email.schedule()', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'scheduled-123', scheduled_at: '2024-01-01T10:00:00Z' })
    })

    await client.email.schedule({
      from: 'test@example.com',
      to: 'user@example.com',
      subject: 'Scheduled Email',
      text: 'Scheduled message',
      scheduled_at: 'tomorrow at 10am'
    }, {
      idempotencyKey: 'scheduled-key-456'
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v2/emails/schedule',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': 'scheduled-key-456'
        })
      })
    )
  })

  test('should include Idempotency-Key header when provided in email.reply()', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'reply-123', messageId: 'reply-msg-789' })
    })

    await client.email.reply('original-email-123', {
      from: 'support@example.com',
      text: 'Reply message'
    }, {
      idempotencyKey: 'reply-key-789'
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v2/emails/original-email-123/reply',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': 'reply-key-789'
        })
      })
    )
  })

  test('should work without idempotency key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-456', messageId: 'msg-789' })
    })

    await client.email.send({
      from: 'test@example.com',
      to: 'user@example.com',
      subject: 'Test Email',
      text: 'Test message'
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v2/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    )

    // Should not include Idempotency-Key header
    const call = mockFetch.mock.calls[0]
    expect(call[1].headers).not.toHaveProperty('Idempotency-Key')
  })

  test('should support idempotency in legacy send() method', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-legacy', messageId: 'msg-legacy' })
    })

    await client.send({
      from: 'test@example.com',
      to: 'user@example.com',
      subject: 'Legacy Test',
      text: 'Legacy message'
    }, {
      idempotencyKey: 'legacy-key-123'
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v2/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'legacy-key-123'
        })
      })
    )
  })

  test('should support idempotency in quickReply() convenience method', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'quick-reply', messageId: 'quick-msg' })
    })

    await client.quickReply(
      'email-123',
      'Thanks for your message!',
      'support@example.com',
      { idempotencyKey: 'quick-reply-key' }
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v2/emails/email-123/reply',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'quick-reply-key'
        })
      })
    )
  })

  test('should support idempotency in scheduleReminder() convenience method', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'reminder-123', scheduled_at: '2024-01-02T09:00:00Z' })
    })

    await client.scheduleReminder(
      'user@example.com',
      'Meeting Reminder',
      'tomorrow at 9am',
      'reminders@example.com',
      { idempotencyKey: 'reminder-key-456' }
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v2/emails/schedule',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'reminder-key-456'
        })
      })
    )
  })
})
