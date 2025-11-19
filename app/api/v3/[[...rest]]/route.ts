import { NextRequest, NextResponse } from 'next/server'
import { createV3Handler } from '../_lib/handler'
import { createContext } from '../_lib/context'
import { createDomain } from '../domains/create'
import { listDomains } from '../domains/list'
import { getDomain } from '../domains/get'
import { updateDomain } from '../domains/update'
import { deleteDomain } from '../domains/delete'
import { createEndpoint } from '../endpoints/create'
import { listEndpoints } from '../endpoints/list'
import { getEndpoint } from '../endpoints/get'
import { updateEndpoint } from '../endpoints/update'
import { deleteEndpoint } from '../endpoints/delete'
import { sendTestEvent } from '../endpoints/send'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'

/**
 * v3 API Router
 * Organized by resource with nested procedures
 */
export const router = {
  domains: {
    list: listDomains,
    create: createDomain,
    get: getDomain,
    update: updateDomain,
    delete: deleteDomain,
  },
  endpoints: {
    list: listEndpoints,
    create: createEndpoint,
    get: getEndpoint,
    update: updateEndpoint,
    delete: deleteEndpoint,
    send: sendTestEvent,
  },
  // Additional resources will be added here:
  // emailAddresses: { ... },
  // etc.
}

// Create the OpenAPI handler
const handler = createV3Handler(router)

// Create OpenAPI spec generator
const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

/**
 * Helper function to handle requests and inject context
 */
async function handleRequest(request: NextRequest) {
  // Serve OpenAPI specification
  if (request.nextUrl.pathname === '/api/v3/openapi.json') {
    console.log('📄 v3: Serving OpenAPI specification')
    
    // Generate the spec
    const spec = await generator.generate(router, {
      info: {
        title: 'Inbound v3 API',
        version: '3.0.0',
        description: 'Type-safe OpenAPI-compliant API for Inbound email management',
        contact: {
          name: 'Inbound Support',
          url: 'https://inbound.new',
          email: 'support@inbound.new',
        },
      },
      servers: [
        {
          url: '/api/v3',
          description: 'v3 API Server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'API Key',
            description: 'API key authentication. Use your API key as the bearer token.',
          },
          sessionAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'session',
            description: 'Session-based authentication via better-auth',
          },
        },
      },
      security: [
        { bearerAuth: [] },
        { sessionAuth: [] },
      ],
    })

    return NextResponse.json(spec, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    })
  }

  // Create context from request
  const context = await createContext({
    headers: request.headers,
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
  })
  try {
    // Handle the request with the OpenAPI handler
    const { response } = await handler.handle(request as any, {
      prefix: '/api/v3',
      context,
    })

    // If response exists, return it
    if (response) {
      return response
    }

    // No procedure matched
    return NextResponse.json(
      {
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: request.nextUrl.pathname,
      },
      { status: 404 }
    )
  } catch (error) {
    console.error('❌ v3: Request handling error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Something went wrong. Please try again later.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * Export all HTTP method handlers
 * Following oRPC Next.js App Router pattern
 */
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
export const HEAD = handleRequest

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS(request: NextRequest) {
  const requestOrigin = request.headers.get('origin') || ''

  const allowedOrigins = [
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://inbound.new',
  ]

  const origin =
    allowedOrigins.find((allowed) => allowed === requestOrigin) ?? allowedOrigins[0]

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  })
}

