/**
 * Svix Event Types
 * Defines the event types that can be sent via Svix webhooks
 */
export const SVIX_EVENT_TYPES = {
  EMAIL_RECEIVED: 'email.received',
} as const;

export type SvixEventType = typeof SVIX_EVENT_TYPES[keyof typeof SVIX_EVENT_TYPES];

