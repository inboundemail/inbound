import { z } from 'zod';

/**
 * Base endpoint schema
 */
export const EndpointSchema = z.object({
  id: z.string().describe('Unique endpoint identifier'),
  name: z.string().describe('User-friendly name'),
  type: z.enum(['webhook', 'email_forward', 'email_group']).describe('Endpoint type'),
  config: z.record(z.string(), z.any()).describe('Type-specific configuration'),
  isActive: z.boolean().describe('Whether endpoint is active'),
  description: z.string().nullable().describe('Optional description'),
  createdAt: z.date().describe('Creation timestamp'),
  updatedAt: z.date().describe('Last update timestamp'),
  // Webhook-specific fields
  svixEndpointId: z.string().nullable().describe('Svix endpoint ID for webhooks'),
  svixFormat: z.enum(['full', 'simple']).nullable().describe('Webhook payload format'),
});

/**
 * Create endpoint input schema
 * Uses discriminated union based on endpoint type
 */
export const CreateEndpointInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('webhook'),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    config: z.object({
      url: z.string().url(),
      format: z.enum(['full', 'simple']).default('full'),
      timeout: z.number().int().min(1).max(60).default(30),
    }),
  }),
  z.object({
    type: z.literal('email_forward'),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    config: z.object({
      forwardTo: z.string().email(),
    }),
  }),
  z.object({
    type: z.literal('email'),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    config: z.object({
      forwardTo: z.string().email(),
    }),
  }),
  z.object({
    type: z.literal('email_group'),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    config: z.object({
      emails: z.array(z.string().email()).min(1).max(100),
    }),
  }),
]);

/**
 * List endpoints input schema
 * Uses z.coerce for query parameters since they come as strings from URL
 * Accepts both 'email' and 'email_forward' for v2 compatibility
 */
export const ListEndpointsInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(['webhook', 'email', 'email_forward', 'email_group']).optional(),
  active: z.coerce.boolean().optional(),
});

/**
 * Get endpoint input schema
 */
export const GetEndpointInput = z.object({
  id: z.string(),
  includePortal: z.coerce.boolean().default(false).describe('Generate Svix portal URL (webhook only)'),
});

/**
 * Update endpoint input schema
 */
export const UpdateEndpointInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

/**
 * Portal URL response schema
 */
export const PortalUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});

