/**
 * RFC 9457 Problem Details Error Schemas
 * Standard error format for all API endpoints
 */

import { z } from "zod"

/**
 * Error category enum for classification
 */
export const ErrorCategoryEnum = z.enum([
  'authentication_error',
  'authorization_error',
  'validation_error',
  'not_found_error',
  'conflict_error',
  'rate_limit_error',
  'server_error'
])

/**
 * Individual field error for validation errors
 */
export const ErrorFieldSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
})

/**
 * RFC 9457 Problem Details Schema with Inbound enhancements
 */
export const ApiErrorSchema = z.object({
  // RFC 9457 standard fields
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string(),
  instance: z.string(),
  
  // Enhanced fields for Inbound
  code: z.string(),
  category: ErrorCategoryEnum,
  field: z.string().optional(),
  errors: z.array(ErrorFieldSchema).optional(),
  request_id: z.string(),
  timestamp: z.string().datetime(),
  doc_url: z.string().url().optional(),
  suggestion: z.string().optional(),
})

export type ApiError = z.infer<typeof ApiErrorSchema>

/**
 * Error code registry for consistency across all endpoints
 */
export const ERROR_CODES = {
  // Authentication (401)
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  API_KEY_EXPIRED: 'API_KEY_EXPIRED',
  
  // Authorization (403)
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  DOMAIN_NOT_OWNED: 'DOMAIN_NOT_OWNED',
  RESOURCE_ACCESS_DENIED: 'RESOURCE_ACCESS_DENIED',
  
  // Validation (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_EMAIL_FORMAT: 'INVALID_EMAIL_FORMAT',
  INVALID_DOMAIN_FORMAT: 'INVALID_DOMAIN_FORMAT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  INVALID_CONTENT: 'INVALID_CONTENT',
  
  // Not Found (404)
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  EMAIL_NOT_FOUND: 'EMAIL_NOT_FOUND',
  DOMAIN_NOT_FOUND: 'DOMAIN_NOT_FOUND',
  ENDPOINT_NOT_FOUND: 'ENDPOINT_NOT_FOUND',
  THREAD_NOT_FOUND: 'THREAD_NOT_FOUND',
  
  // Conflict (409)
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  DOMAIN_ALREADY_REGISTERED: 'DOMAIN_ALREADY_REGISTERED',
  EMAIL_ADDRESS_ALREADY_EXISTS: 'EMAIL_ADDRESS_ALREADY_EXISTS',
  
  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  EMAIL_LIMIT_REACHED: 'EMAIL_LIMIT_REACHED',
  DOMAIN_LIMIT_REACHED: 'DOMAIN_LIMIT_REACHED',
  ENDPOINT_LIMIT_REACHED: 'ENDPOINT_LIMIT_REACHED',
  
  // Server Errors (500)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  AWS_SES_ERROR: 'AWS_SES_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

/**
 * Build a standardized RFC 9457 error response
 * 
 * @param params - Error parameters
 * @returns RFC 9457 compliant error object
 * 
 * @example
 * ```typescript
 * const apiError = buildApiError({
 *   status: 401,
 *   code: ERROR_CODES.AUTHENTICATION_REQUIRED,
 *   title: 'Authentication Required',
 *   detail: 'Valid API key required',
 *   instance: '/api/v2/emails',
 *   category: 'authentication_error',
 *   suggestion: 'Include Authorization: Bearer <api_key> header',
 *   requestId: 'req_abc123',
 * })
 * ```
 */
export function buildApiError(params: {
  status: number
  code: string
  title: string
  detail: string
  instance: string
  category: z.infer<typeof ErrorCategoryEnum>
  field?: string
  errors?: Array<{ field: string; code: string; message: string }>
  suggestion?: string
  requestId: string
}): ApiError {
  return {
    type: `https://inbound.new/errors/${params.code.toLowerCase().replace(/_/g, '-')}`,
    title: params.title,
    status: params.status,
    detail: params.detail,
    instance: params.instance,
    code: params.code,
    category: params.category,
    field: params.field,
    errors: params.errors,
    request_id: params.requestId,
    timestamp: new Date().toISOString(),
    doc_url: `https://docs.inbound.new/errors/${params.code.toLowerCase().replace(/_/g, '-')}`,
    suggestion: params.suggestion,
  }
}

/**
 * Convert Zod validation errors to RFC 9457 error format
 * 
 * @param zodError - Zod validation error
 * @param instance - API endpoint path
 * @param requestId - Unique request identifier
 * @returns RFC 9457 compliant error object
 * 
 * @example
 * ```typescript
 * try {
 *   const data = schema.parse(input)
 * } catch (err) {
 *   if (err instanceof ZodError) {
 *     const apiError = zodErrorToApiError(err, '/api/v2/emails', requestId)
 *     return NextResponse.json(apiError, { status: 400 })
 *   }
 * }
 * ```
 */
export function zodErrorToApiError(
  zodError: z.ZodError,
  instance: string,
  requestId: string
): ApiError {
  const errors = zodError.issues.map((err: z.ZodIssue) => ({
    field: err.path.join('.'),
    code: err.code.toUpperCase(),
    message: err.message,
  }))
  
  return buildApiError({
    status: 400,
    code: ERROR_CODES.VALIDATION_ERROR,
    title: 'Validation Error',
    detail: 'The request contains invalid parameters',
    instance,
    category: 'validation_error',
    errors,
    suggestion: 'Check the errors array for specific field issues',
    requestId,
  })
}

