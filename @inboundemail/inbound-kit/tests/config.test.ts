/**
 * Tests for configuration loading and validation
 */

import { describe, test, expect } from 'bun:test'
import { normalizeEndpoint } from '../src/config.js'
import type { EndpointShorthand } from '../src/types.js'

describe('Configuration Loading', () => {
  
  describe('normalizeEndpoint', () => {
    
    test('should normalize simple webhook URL', () => {
      const result = normalizeEndpoint('https://api.example.com/webhook', 'test-endpoint')
      
      expect(result).toEqual({
        type: 'webhook',
        url: 'https://api.example.com/webhook'
      })
    })

    test('should normalize email group array', () => {
      const emails = ['admin@company.com', 'dev@company.com']
      const result = normalizeEndpoint(emails, 'support-team')
      
      expect(result).toEqual({
        type: 'email_group',
        emails: emails
      })
    })

    test('should normalize email forwarding', () => {
      const result = normalizeEndpoint({ forward: 'admin@company.com' }, 'sales-forward')
      
      expect(result).toEqual({
        type: 'email',
        email: 'admin@company.com'
      })
    })

    test('should normalize Slack webhook shorthand', () => {
      const result = normalizeEndpoint({ slack: 'https://hooks.slack.com/webhook' }, 'slack-alerts')
      
      expect(result).toEqual({
        type: 'slack',
        webhookUrl: 'https://hooks.slack.com/webhook'
      })
    })

    test('should normalize Slack webhook with options', () => {
      const slackConfig = {
        slack: {
          url: 'https://hooks.slack.com/webhook',
          channel: '#alerts',
          username: 'Bot'
        }
      }
      const result = normalizeEndpoint(slackConfig, 'slack-alerts')
      
      expect(result).toEqual({
        type: 'slack',
        webhookUrl: 'https://hooks.slack.com/webhook',
        channel: '#alerts',
        username: 'Bot'
      })
    })

    test('should normalize Discord webhook', () => {
      const result = normalizeEndpoint({ discord: 'https://discord.com/api/webhooks/123' }, 'discord-alerts')
      
      expect(result).toEqual({
        type: 'discord',
        webhookUrl: 'https://discord.com/api/webhooks/123'
      })
    })

    test('should throw error for invalid URL', () => {
      expect(() => {
        normalizeEndpoint('not-a-valid-url', 'invalid-endpoint')
      }).toThrow('Invalid endpoint configuration')
    })

    test('should throw error for invalid configuration', () => {
      expect(() => {
        normalizeEndpoint({ invalid: 'config' } as any, 'invalid-endpoint')
      }).toThrow('Invalid endpoint configuration')
    })
  })
})
