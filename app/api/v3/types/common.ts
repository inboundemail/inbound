import { z } from 'zod'

// Pagination
export const PaginationSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0)
})

export type Pagination = z.infer<typeof PaginationSchema>

export interface PaginationMetadata {
  limit: number
  offset: number
  total: number
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationMetadata
  meta?: Record<string, any>
}

// Standard success response
export interface SuccessResponse<T> {
  data: T
  meta?: Record<string, any>
}

// Query parameter helpers
export const parseQueryParams = (searchParams: URLSearchParams) => {
  const limit = Math.min(
    parseInt(searchParams.get('limit') || '50'), 
    100
  )
  const offset = Math.max(
    parseInt(searchParams.get('offset') || '0'),
    0
  )
  
  return { limit, offset }
}


