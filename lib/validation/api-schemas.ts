import { z } from 'zod'

/**
 * Common validation schemas for API endpoints
 */

// Email validation
export const emailSchema = z.string().email('Invalid email format')

// URL validation
export const urlSchema = z.string().url('Invalid URL format')

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID format')

// Pagination schemas
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

// Common query parameter schemas
export const commonQuerySchema = z.object({
  ...paginationSchema.shape,
  sort: z.enum(['asc', 'desc']).optional(),
  sortBy: z.string().optional(),
})

// Webhook configuration schema
export const webhookConfigSchema = z.object({
  url: urlSchema,
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).default(10000),
  retryAttempts: z.number().min(0).max(5).default(3),
})

// Email configuration schema
export const emailConfigSchema = z.object({
  forwardTo: emailSchema,
})

// Email group configuration schema
export const emailGroupConfigSchema = z.object({
  emails: z.array(emailSchema).min(1).max(50),
})

// Endpoint schemas
export const endpointTypeSchema = z.enum(['webhook', 'email', 'email_group'])

export const createEndpointSchema = z.object({
  name: z.string().min(1).max(100),
  type: endpointTypeSchema,
  description: z.string().max(500).optional(),
  config: z.union([
    webhookConfigSchema,
    emailConfigSchema,
    emailGroupConfigSchema,
  ]),
})

export const updateEndpointSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  config: z.union([
    webhookConfigSchema,
    emailConfigSchema,
    emailGroupConfigSchema,
  ]).optional(),
  isActive: z.boolean().optional(),
})

// Domain schemas
export const createDomainSchema = z.object({
  domain: z.string().regex(
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/,
    'Invalid domain format'
  ),
})

// Email address schemas
export const createEmailAddressSchema = z.object({
  address: emailSchema,
  name: z.string().max(100).optional(),
  endpointId: uuidSchema,
})

export const updateEmailAddressSchema = z.object({
  name: z.string().max(100).optional().nullable(),
  endpointId: uuidSchema.optional(),
  isActive: z.boolean().optional(),
})

// Webhook payload schemas
export const webhookTestPayloadSchema = z.object({
  test: z.boolean().default(true),
  timestamp: z.string().datetime(),
})

// API response schemas
export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
  code: z.string().optional(),
})

export const apiSuccessSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
})

// Validation helper functions
export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ')
      return { success: false, error: errors }
    }
    return { success: false, error: 'Invalid request data' }
  }
}

export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  params: URLSearchParams | Record<string, string | string[] | undefined>
): { success: true; data: T } | { success: false; error: string } {
  try {
    // Convert URLSearchParams to object if needed
    const data = params instanceof URLSearchParams 
      ? Object.fromEntries(params.entries())
      : params
      
    const validated = schema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ')
      return { success: false, error: errors }
    }
    return { success: false, error: 'Invalid query parameters' }
  }
}