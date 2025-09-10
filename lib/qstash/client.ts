/**
 * QStash client configuration and initialization
 * Handles message scheduling, publishing, and webhook verification
 */

import { Client } from '@upstash/qstash';
import { Receiver } from '@upstash/qstash';

// Environment validation
const requiredEnvVars = {
  QSTASH_TOKEN: process.env.QSTASH_TOKEN,
  QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
  QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
} as const;

function validateEnvironment() {
  const missing = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing QStash environment variables: ${missing.join(', ')}`);
  }
}

/**
 * QStash client singleton with retry configuration
 */
class QStashClient {
  private static instance: QStashClient;
  private client: Client;
  private receiver: Receiver;

  private constructor() {
    validateEnvironment();

    this.client = new Client({
      token: requiredEnvVars.QSTASH_TOKEN!,
      retry: {
        retries: 3,
        backoff: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 30000), // Cap at 30s
      },
    });

    this.receiver = new Receiver({
      currentSigningKey: requiredEnvVars.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: requiredEnvVars.QSTASH_NEXT_SIGNING_KEY!,
    });
  }

  static getInstance(): QStashClient {
    if (!QStashClient.instance) {
      QStashClient.instance = new QStashClient();
    }
    return QStashClient.instance;
  }

  get qstash() {
    return this.client;
  }

  get verifier() {
    return this.receiver;
  }

  /**
   * Publish a message immediately
   */
  async publishMessage(options: {
    url: string;
    body: any;
    headers?: Record<string, string>;
    delay?: string | number;
    retries?: number;
    callback?: string;
    failureCallback?: string;
    deduplicationId?: string;
    contentBasedDeduplication?: boolean;
  }) {
    // Handle delay type conversion for QStash
    let qstashDelay: number | `${bigint}s` | `${bigint}m` | `${bigint}h` | `${bigint}d` | undefined = undefined;
    
    if (typeof options.delay === 'number') {
      qstashDelay = options.delay; // Use as number directly
    } else if (typeof options.delay === 'string') {
      qstashDelay = options.delay as `${bigint}s` | `${bigint}m` | `${bigint}h` | `${bigint}d`;
    }

    return await this.client.publishJSON({
      url: options.url,
      body: options.body,
      headers: options.headers,
      delay: qstashDelay,
      retries: options.retries,
      callback: options.callback,
      failureCallback: options.failureCallback,
      deduplicationId: options.deduplicationId,
      contentBasedDeduplication: options.contentBasedDeduplication,
    });
  }

  /**
   * Create a one-time delayed message (replaces database scheduling)
   */
  async scheduleOneTimeMessage(options: {
    url: string;
    body: any;
    scheduledAt: Date;
    headers?: Record<string, string>;
    callback?: string;
    failureCallback?: string;
    deduplicationId?: string;
  }) {
    const now = new Date();
    const delay = Math.max(0, options.scheduledAt.getTime() - now.getTime());
    
    if (delay === 0) {
      // Send immediately if scheduled time is now or in the past
      return await this.publishMessage({
        url: options.url,
        body: options.body,
        headers: options.headers,
        callback: options.callback,
        failureCallback: options.failureCallback,
        deduplicationId: options.deduplicationId,
      });
    }

    return await this.publishMessage({
      url: options.url,
      body: options.body,
      headers: options.headers,
      delay: Math.floor(delay / 1000), // QStash expects seconds
      callback: options.callback,
      failureCallback: options.failureCallback,
      deduplicationId: options.deduplicationId,
    });
  }

  /**
   * Verify incoming webhook signature
   */
  async verifySignature(options: {
    signature: string;
    body: string;
    url?: string;
  }): Promise<boolean> {
    try {
      return await this.receiver.verify({
        signature: options.signature,
        body: options.body,
        url: options.url,
      });
    } catch (error) {
      console.error('QStash signature verification failed:', error);
      return false;
    }
  }

  /**
   * List all schedules
   */
  async listSchedules() {
    return await this.client.schedules.list();
  }
}

// Export singleton instance
export const qstashClient = QStashClient.getInstance();

// Export types for external use
export interface QStashEmailScheduleOptions {
  scheduledEmailId: string;
  userId: string;
  emailData: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    replyTo?: string[];
    subject: string;
    textBody?: string;
    htmlBody?: string;
    headers?: Record<string, string>;
    attachments?: any[];
  };
  scheduledAt: Date;
  idempotencyKey?: string;
}