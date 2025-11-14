import { z } from 'zod'

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional()
  })
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'APIError'
  }

  toJSON(): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    }
  }
}

// Common error codes
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST'
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]


