/**
 * Test the new hierarchical SDK structure
 */

import { InboundEmailClient } from '../src/client'

describe('Hierarchical SDK Structure', () => {
  let client: InboundEmailClient

  beforeAll(() => {
    client = new InboundEmailClient('test-api-key', 'http://localhost:3000/api/v2')
  })

  test('should have hierarchical email.address structure', () => {
    expect(client.email).toBeDefined()
    expect(client.email.address).toBeDefined()
    expect(client.email.address.create).toBeDefined()
    expect(client.email.address.list).toBeDefined()
    expect(client.email.address.get).toBeDefined()
    expect(client.email.address.update).toBeDefined()
    expect(client.email.address.delete).toBeDefined()
  })

  test('should have mail methods for inbound emails', () => {
    expect(client.mail).toBeDefined()
    expect(client.mail.list).toBeDefined()
    expect(client.mail.get).toBeDefined()
    expect(client.mail.thread).toBeDefined()
    expect(client.mail.markRead).toBeDefined()
    expect(client.mail.markUnread).toBeDefined()
    expect(client.mail.archive).toBeDefined()
    expect(client.mail.unarchive).toBeDefined()
    expect(client.mail.reply).toBeDefined()
    expect(client.mail.bulk).toBeDefined()
    expect(typeof client.mail.bulk).toBe('function')
  })

  test('should have email methods for outbound emails', () => {
    expect(client.email).toBeDefined()
    expect(client.email.send).toBeDefined()
    expect(client.email.get).toBeDefined()
    expect(client.email.reply).toBeDefined()
    expect(client.email.schedule).toBeDefined()
    expect(client.email.listScheduled).toBeDefined()
    expect(client.email.getScheduled).toBeDefined()
    expect(client.email.cancel).toBeDefined()
  })

  test('should have domain methods', () => {
    expect(client.domain).toBeDefined()
    expect(client.domain.create).toBeDefined()
    expect(client.domain.list).toBeDefined()
    expect(client.domain.get).toBeDefined()
    expect(client.domain.update).toBeDefined()
    expect(client.domain.delete).toBeDefined()
    expect(client.domain.verify).toBeDefined()
    expect(client.domain.getDnsRecords).toBeDefined()
    expect(client.domain.checkStatus).toBeDefined()
  })

  test('should have endpoint methods', () => {
    expect(client.endpoint).toBeDefined()
    expect(client.endpoint.create).toBeDefined()
    expect(client.endpoint.list).toBeDefined()
    expect(client.endpoint.get).toBeDefined()
    expect(client.endpoint.update).toBeDefined()
    expect(client.endpoint.delete).toBeDefined()
    expect(client.endpoint.test).toBeDefined()
  })

  test('should have convenience methods', () => {
    expect(client.quickReply).toBeDefined()
    expect(client.setupDomain).toBeDefined()
    expect(client.createForwarder).toBeDefined()
    expect(client.scheduleReminder).toBeDefined()
  })

  test('should have legacy compatibility aliases', () => {
    expect(client.domains).toBe(client.domain)
    expect(client.endpoints).toBe(client.endpoint)
    expect(client.emailAddresses).toBe(client.email.address)
    expect(client.emails).toBe(client.email)
  })

  test('should return { data, error } pattern', async () => {
    // Mock fetch to return a successful response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'test-123', domain: 'example.com' })
    })

    const result = await client.domain.list()
    
    expect(result).toHaveProperty('data')
    expect(result).not.toHaveProperty('error')
    expect(result.data).toEqual({ id: 'test-123', domain: 'example.com' })
  })

  test('should return { data, error } pattern on error', async () => {
    // Mock fetch to return an error response
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Invalid API key' })
    })

    const result = await client.domain.list()
    
    expect(result).toHaveProperty('error')
    expect(result).not.toHaveProperty('data')
    expect(result.error).toBe('Invalid API key')
  })

  test('should handle network errors', async () => {
    // Mock fetch to throw a network error
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

    const result = await client.domain.list()
    
    expect(result).toHaveProperty('error')
    expect(result).not.toHaveProperty('data')
    expect(result.error).toBe('Network error')
  })
})