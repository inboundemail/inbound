import { z } from 'zod'
import { endpoints } from '@/lib/db/schema'

// Infer base type from database schema
export type Endpoint = typeof endpoints.$inferSelect

// Endpoint type enum
export const EndpointTypeSchema = z.enum(['webhook', 'function']).describe('The type of endpoint')

// Create endpoint input
export const CreateEndpointSchema = z.object({
  name: z.string().min(1).max(255).describe('Endpoint name'),
  type: EndpointTypeSchema.describe('Endpoint type (webhook or function)'),
  url: z.string().url().optional().describe('Webhook URL (required for webhook type)'),
  functionCode: z.string().optional().describe('Function code (required for function type)'),
  isActive: z.boolean().default(true).describe('Whether the endpoint is active'),
  headers: z.record(z.string()).optional().describe('Custom headers for webhook requests'),
  timeout: z.number().min(1000).max(30000).default(5000).describe('Request timeout in milliseconds'),
  retryAttempts: z.number().min(0).max(5).default(3).describe('Number of retry attempts on failure')
}).refine((data) => {
  // Webhook endpoints must have a URL
  if (data.type === 'webhook' && !data.url) {
    return false
  }
  // Function endpoints must have code
  if (data.type === 'function' && !data.functionCode) {
    return false
  }
  return true
}, {
  message: 'Webhook endpoints require a URL, function endpoints require code'
})

export type CreateEndpointInput = z.infer<typeof CreateEndpointSchema>

// Update endpoint input
export const UpdateEndpointSchema = z.object({
  name: z.string().min(1).max(255).optional().describe('Update endpoint name'),
  url: z.string().url().optional().describe('Update webhook URL'),
  functionCode: z.string().optional().describe('Update function code'),
  isActive: z.boolean().optional().describe('Enable or disable endpoint'),
  headers: z.record(z.string()).optional().describe('Update custom headers'),
  timeout: z.number().min(1000).max(30000).optional().describe('Update timeout'),
  retryAttempts: z.number().min(0).max(5).optional().describe('Update retry attempts')
})

export type UpdateEndpointInput = z.infer<typeof UpdateEndpointSchema>

// Get endpoint input
export const GetEndpointSchema = z.object({
  id: z.string().uuid().describe('The endpoint ID')
})

export type GetEndpointInput = z.infer<typeof GetEndpointSchema>

// List endpoints input
export const ListEndpointsSchema = z.object({
  limit: z.number().min(1).max(100).default(50).describe('Number of results to return'),
  offset: z.number().min(0).default(0).describe('Number of results to skip'),
  type: EndpointTypeSchema.optional().describe('Filter by endpoint type'),
  isActive: z.boolean().optional().describe('Filter by active status')
})

export type ListEndpointsInput = z.infer<typeof ListEndpointsSchema>

// Test endpoint input
export const TestEndpointSchema = z.object({
  id: z.string().uuid().describe('The endpoint ID'),
  payload: z.record(z.any()).optional().describe('Test payload to send')
})

export type TestEndpointInput = z.infer<typeof TestEndpointSchema>

// Endpoint stats
export interface EndpointStats {
  totalDeliveries: number
  successfulDeliveries: number
  failedDeliveries: number
  averageResponseTime: number
  lastDeliveryAt: Date | null
}

// Endpoint response type with additional computed fields
export interface EndpointResponse extends Endpoint {
  stats?: EndpointStats
}

// Test endpoint response
export interface TestEndpointResponse {
  success: boolean
  statusCode?: number
  responseTime: number
  error?: string
  response?: any
}


