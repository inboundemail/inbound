import type { WebhookFormat } from '@/lib/db/schema'
import type { InboundWebhookPayload } from '@inboundemail/sdk'

// Base email data structure that all formats will use
export interface BaseEmailData {
  messageId: string
  from: string
  to: string
  subject: string
  textBody?: string
  htmlBody?: string
  attachments?: Array<{
    filename?: string
    contentType?: string
    size?: number
  }>
  headers?: Record<string, any>
  timestamp: string
  recipient?: string
  endpointId?: string
  endpointName?: string
}

// Discord webhook format
// Based on Discord webhook documentation: https://discord.com/developers/docs/resources/webhook
export interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  tts?: boolean
  embeds?: Array<{
    title?: string
    description?: string
    url?: string
    timestamp?: string
    color?: number
    footer?: {
      text: string
      icon_url?: string
    }
    image?: {
      url: string
    }
    thumbnail?: {
      url: string
    }
    author?: {
      name: string
      url?: string
      icon_url?: string
    }
    fields?: Array<{
      name: string
      value: string
      inline?: boolean
    }>
  }>
  allowed_mentions?: {
    parse?: string[]
    roles?: string[]
    users?: string[]
    replied_user?: boolean
  }
}

// Slack webhook format (for future implementation)
export interface SlackWebhookPayload {
  text?: string
  username?: string
  icon_url?: string
  icon_emoji?: string
  channel?: string
  attachments?: Array<{
    fallback?: string
    color?: string
    pretext?: string
    author_name?: string
    author_link?: string
    author_icon?: string
    title?: string
    title_link?: string
    text?: string
    fields?: Array<{
      title: string
      value: string
      short?: boolean
    }>
    image_url?: string
    thumb_url?: string
    footer?: string
    footer_icon?: string
    ts?: number
  }>
}

// Webhook format configuration
export interface WebhookFormatConfig {
  name: string
  description: string
  testPayload: (data: BaseEmailData) => any
  realPayload: (data: BaseEmailData) => any
}

// Format implementations
export const WEBHOOK_FORMAT_CONFIGS: Record<WebhookFormat, WebhookFormatConfig> = {
  inbound: {
    name: 'Inbound Webhook',
    description: 'Standard Inbound email webhook format with full email data',
    testPayload: (data: BaseEmailData): InboundWebhookPayload => ({
      event: 'email.received',
      timestamp: data.timestamp,
      email: {
        id: data.messageId || `test-email-${Date.now()}`,
        messageId: data.messageId || null,
        from: data.from ? {
          text: data.from,
          addresses: [{ name: null, address: data.from }]
        } : null,
        to: data.to ? {
          text: data.to,
          addresses: [{ name: null, address: data.to }]
        } : null,
        recipient: data.to || 'test@example.com',
        subject: data.subject || null,
        receivedAt: data.timestamp,
        parsedData: {
          messageId: data.messageId,
          date: new Date(data.timestamp),
          subject: data.subject,
          from: data.from ? {
            text: data.from,
            addresses: [{ name: null, address: data.from }]
          } : null,
          to: data.to ? {
            text: data.to,
            addresses: [{ name: null, address: data.to }]
          } : null,
          cc: null,
          bcc: null,
          replyTo: null,
          inReplyTo: undefined,
          references: undefined,
          textBody: data.textBody || 'This is a test email from the Inbound Email service to verify webhook functionality.',
          htmlBody: data.htmlBody || '<p>This is a test email from the <strong>Inbound Email service</strong> to verify webhook functionality.</p>',
          attachments: data.attachments || [],
          headers: data.headers || {},
          priority: undefined
        },
        cleanedContent: {
          html: data.htmlBody || '<p>This is a test email from the <strong>Inbound Email service</strong> to verify webhook functionality.</p>',
          text: data.textBody || 'This is a test email from the Inbound Email service to verify webhook functionality.',
          hasHtml: !!(data.htmlBody || true),
          hasText: !!(data.textBody || true),
          attachments: data.attachments || [],
          headers: data.headers || {}
        }
      },
      endpoint: {
        id: 'test-endpoint',
        name: 'Test Endpoint',
        type: 'webhook'
      }
    }),
    realPayload: (data: BaseEmailData): InboundWebhookPayload => ({
      event: 'email.received',
      timestamp: data.timestamp,
      email: {
        id: data.messageId || `email-${Date.now()}`,
        messageId: data.messageId || null,
        from: data.from ? {
          text: data.from,
          addresses: [{ name: null, address: data.from }]
        } : null,
        to: data.to ? {
          text: data.to,
          addresses: [{ name: null, address: data.to }]
        } : null,
        recipient: data.to || '',
        subject: data.subject || null,
        receivedAt: data.timestamp,
        parsedData: {
          messageId: data.messageId,
          date: new Date(data.timestamp),
          subject: data.subject,
          from: data.from ? {
            text: data.from,
            addresses: [{ name: null, address: data.from }]
          } : null,
          to: data.to ? {
            text: data.to,
            addresses: [{ name: null, address: data.to }]
          } : null,
          cc: null,
          bcc: null,
          replyTo: null,
          inReplyTo: undefined,
          references: undefined,
          textBody: data.textBody,
          htmlBody: data.htmlBody,
          attachments: data.attachments || [],
          headers: data.headers || {},
          priority: undefined
        },
        cleanedContent: {
          html: data.htmlBody || null,
          text: data.textBody || null,
          hasHtml: !!data.htmlBody,
          hasText: !!data.textBody,
          attachments: data.attachments || [],
          headers: data.headers || {}
        }
      },
      endpoint: {
        id: data.endpointId || 'endpoint-id',
        name: data.endpointName || 'Email Endpoint',
        type: 'webhook'
      }
    })
  },
  
  discord: {
    name: 'Discord Webhook',
    description: 'Discord-compatible webhook format with rich embeds',
    testPayload: (data: BaseEmailData): DiscordWebhookPayload => ({
      content: `📧 **Test Email Received**`,
      embeds: [{
        title: data.subject || 'Test Email - Inbound Email Service',
        description: data.textBody || 'This is a test email from the Inbound Email service to verify webhook functionality.',
        color: 0x00ff00, // Green color for test
        timestamp: data.timestamp,
        footer: {
          text: 'Inbound Email Service - Test',
          icon_url: 'https://inbound.new/favicon.ico'
        },
        fields: [
          {
            name: 'From',
            value: data.from || 'test@example.com',
            inline: true
          },
          {
            name: 'To',
            value: data.to.join(', ') || data.recipient,
            inline: true
          },
          {
            name: 'Message ID',
            value: `\`${data.messageId}\``,
            inline: false
          }
        ]
      }]
    }),
    realPayload: (data: BaseEmailData): DiscordWebhookPayload => ({
      content: `📧 **New Email Received**`,
      embeds: [{
        title: data.subject || 'No Subject',
        description: data.textBody ? (data.textBody.length > 2000 ? data.textBody.substring(0, 2000) + '...' : data.textBody) : 'No content',
        color: 0x0099ff, // Blue color for real emails
        timestamp: data.timestamp,
        footer: {
          text: 'Inbound Email Service',
          icon_url: 'https://inbound.new/favicon.ico'
        },
        fields: [
          {
            name: 'From',
            value: data.from,
            inline: true
          },
          {
            name: 'To',
            value: data.to.join(', '),
            inline: true
          },
          ...(data.attachments && data.attachments.length > 0 ? [{
            name: 'Attachments',
            value: data.attachments.map(att => att.filename || 'Unknown').join(', '),
            inline: false
          }] : []),
          {
            name: 'Message ID',
            value: `\`${data.messageId}\``,
            inline: false
          }
        ]
      }]
    })
  },
  
  slack: {
    name: 'Slack Webhook',
    description: 'Slack-compatible webhook format with attachments',
    testPayload: (data: BaseEmailData): SlackWebhookPayload => ({
      text: `📧 *Test Email Received*`,
      username: 'Inbound Email',
      icon_url: 'https://inbound.new/favicon.ico',
      attachments: [{
        fallback: `Test email: ${data.subject}`,
        color: 'good',
        title: data.subject || 'Test Email - Inbound Email Service',
        text: data.textBody || 'This is a test email from the Inbound Email service to verify webhook functionality.',
        fields: [
          {
            title: 'From',
            value: data.from || 'test@example.com',
            short: true
          },
          {
            title: 'To',
            value: data.to.join(', ') || data.recipient,
            short: true
          },
          {
            title: 'Message ID',
            value: data.messageId,
            short: false
          }
        ],
        footer: 'Inbound Email Service - Test',
        ts: Math.floor(new Date(data.timestamp).getTime() / 1000)
      }]
    }),
    realPayload: (data: BaseEmailData): SlackWebhookPayload => ({
      text: `📧 *New Email Received*`,
      username: 'Inbound Email',
      icon_url: 'https://inbound.new/favicon.ico',
      attachments: [{
        fallback: `New email: ${data.subject}`,
        color: '#0099ff',
        title: data.subject || 'No Subject',
        text: data.textBody ? (data.textBody.length > 1000 ? data.textBody.substring(0, 1000) + '...' : data.textBody) : 'No content',
        fields: [
          {
            title: 'From',
            value: data.from,
            short: true
          },
          {
            title: 'To',
            value: data.to.join(', '),
            short: true
          },
          ...(data.attachments && data.attachments.length > 0 ? [{
            title: 'Attachments',
            value: data.attachments.map(att => att.filename || 'Unknown').join(', '),
            short: false
          }] : []),
          {
            title: 'Message ID',
            value: data.messageId,
            short: false
          }
        ],
        footer: 'Inbound Email Service',
        ts: Math.floor(new Date(data.timestamp).getTime() / 1000)
      }]
    })
  }
}

// Helper function to get webhook format config
export function getWebhookFormatConfig(format: WebhookFormat): WebhookFormatConfig {
  return WEBHOOK_FORMAT_CONFIGS[format]
}

// Helper function to generate test payload for any format
export function generateTestPayload(format: WebhookFormat, baseData?: Partial<BaseEmailData>): any {
  const config = getWebhookFormatConfig(format)
  const defaultData: BaseEmailData = {
    messageId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    from: 'test@example.com',
    to: ['test@yourdomain.com'],
    subject: 'Test Email - Inbound Email Service',
    textBody: 'This is a test email from the Inbound Email service to verify webhook functionality.',
    htmlBody: '<p>This is a test email from the <strong>Inbound Email service</strong> to verify webhook functionality.</p>',
    attachments: [],
    headers: {
      'From': 'test@example.com',
      'To': 'test@yourdomain.com',
      'Subject': 'Test Email - Inbound Email Service',
      'Date': new Date().toISOString()
    },
    timestamp: new Date().toISOString(),
    recipient: 'test@yourdomain.com'
  }
  
  const mergedData = { ...defaultData, ...baseData }
  return config.testPayload(mergedData)
}

// Helper function to generate real payload for any format
export function generateRealPayload(format: WebhookFormat, emailData: BaseEmailData): any {
  const config = getWebhookFormatConfig(format)
  return config.realPayload(emailData)
} 