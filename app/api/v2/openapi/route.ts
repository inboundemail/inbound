import { NextResponse } from 'next/server'

/**
 * GET /api/v2/openapi
 * Returns the OpenAPI 3.0 specification for the v2 API
 * 
 * This endpoint provides a manually curated OpenAPI spec based on
 * our defineRoute implementations. The spec includes Bearer token
 * authentication and all v2 API endpoints.
 * 
 * View in Swagger UI: https://editor.swagger.io/
 */
export async function GET() {
  try {
    console.log('📄 Generating OpenAPI specification...')
    
    // Manually define OpenAPI spec based on our routes
    // In the future, we can use @omer-x/next-openapi-json-generator
    // to auto-generate this from defineRoute metadata
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'inbound email API',
        version: '2.0.0',
        description: 'Complete API for managing email domains, sending emails, and processing inbound emails. All endpoints require Bearer token authentication.',
        contact: {
          name: 'Inbound Support',
          url: 'https://inbound.new',
          email: 'support@inbound.new'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      servers: [
        {
          url: 'https://inbound.new',
          description: 'Production server'
        },
        {
          url: 'http://localhost:3000',
          description: 'Development server'
        }
      ],
      // Add Bearer token authentication scheme
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'API Key',
            description: 'Enter your API key from the Inbound dashboard. Get your key at https://inbound.new/dashboard/settings/api-keys'
          }
        },
        schemas: {
          ApiError: {
            type: 'object',
            required: ['type', 'title', 'status', 'detail', 'instance', 'code', 'category', 'request_id', 'timestamp'],
            properties: {
              type: {
                type: 'string',
                format: 'uri',
                description: 'A URI reference that identifies the problem type',
                example: 'https://inbound.new/errors/authentication-required'
              },
              title: {
                type: 'string',
                description: 'A short, human-readable summary of the problem',
                example: 'Authentication Required'
              },
              status: {
                type: 'integer',
                minimum: 100,
                maximum: 599,
                description: 'The HTTP status code',
                example: 401
              },
              detail: {
                type: 'string',
                description: 'A human-readable explanation specific to this occurrence',
                example: 'Valid API key required to send emails'
              },
              instance: {
                type: 'string',
                description: 'A URI reference that identifies the specific occurrence',
                example: '/api/v2/emails'
              },
              code: {
                type: 'string',
                description: 'Application-specific error code',
                example: 'AUTHENTICATION_REQUIRED'
              },
              category: {
                type: 'string',
                enum: ['authentication_error', 'authorization_error', 'validation_error', 'not_found_error', 'conflict_error', 'rate_limit_error', 'server_error'],
                description: 'Error category for filtering and monitoring'
              },
              field: {
                type: 'string',
                description: 'The field that caused the error (for validation errors)',
                example: 'from'
              },
              errors: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['field', 'code', 'message'],
                  properties: {
                    field: { type: 'string', example: 'from' },
                    code: { type: 'string', example: 'INVALID_EMAIL_FORMAT' },
                    message: { type: 'string', example: 'Email address must follow user@domain.com format' }
                  }
                },
                description: 'Detailed list of field-specific errors'
              },
              request_id: {
                type: 'string',
                description: 'Unique request identifier for debugging',
                example: 'req_abc123xyz'
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
                description: 'When the error occurred',
                example: '2025-10-10T14:30:00Z'
              },
              doc_url: {
                type: 'string',
                format: 'uri',
                description: 'Link to error documentation',
                example: 'https://docs.inbound.new/errors/authentication-required'
              },
              suggestion: {
                type: 'string',
                description: 'Helpful suggestion for resolving the error',
                example: 'Include Authorization: Bearer <api_key> header in your request'
              }
            }
          }
        }
      },
      // Apply security globally (all routes require Bearer token)
      security: [
        {
          bearerAuth: []
        }
      ],
      paths: {
        '/api/v2/emails': {
          post: {
            operationId: 'sendEmail',
            summary: 'Send an email',
            description: 'Sends an email using AWS SES with support for attachments, HTML/text content, and Resend-compatible API. Tracks usage limits via Autumn.',
            tags: ['Emails'],
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['from', 'to', 'subject'],
                    properties: {
                      from: {
                        type: 'string',
                        format: 'email',
                        description: 'Sender email address (must be from a verified domain)',
                        example: 'hello@yourdomain.com'
                      },
                      to: {
                        oneOf: [
                          { type: 'string', format: 'email' },
                          { type: 'array', items: { type: 'string', format: 'email' } }
                        ],
                        description: 'Recipient email address(es)',
                        example: 'user@example.com'
                      },
                      subject: {
                        type: 'string',
                        minLength: 1,
                        description: 'Email subject line',
                        example: 'Welcome to Inbound!'
                      },
                      cc: {
                        oneOf: [
                          { type: 'string', format: 'email' },
                          { type: 'array', items: { type: 'string', format: 'email' } }
                        ],
                        description: 'CC recipients (optional)'
                      },
                      bcc: {
                        oneOf: [
                          { type: 'string', format: 'email' },
                          { type: 'array', items: { type: 'string', format: 'email' } }
                        ],
                        description: 'BCC recipients (optional)'
                      },
                      replyTo: {
                        oneOf: [
                          { type: 'string', format: 'email' },
                          { type: 'array', items: { type: 'string', format: 'email' } }
                        ],
                        description: 'Reply-to address(es) (optional)'
                      },
                      reply_to: {
                        oneOf: [
                          { type: 'string', format: 'email' },
                          { type: 'array', items: { type: 'string', format: 'email' } }
                        ],
                        description: 'Reply-to address(es) - legacy format (optional)'
                      },
                      html: {
                        type: 'string',
                        description: 'HTML email body (either html or text required)',
                        example: '<h1>Welcome!</h1><p>Thanks for signing up.</p>'
                      },
                      text: {
                        type: 'string',
                        description: 'Plain text email body (either html or text required)',
                        example: 'Welcome! Thanks for signing up.'
                      },
                      headers: {
                        type: 'object',
                        additionalProperties: { type: 'string' },
                        description: 'Custom email headers (optional)'
                      },
                      attachments: {
                        type: 'array',
                        items: { type: 'object' },
                        description: 'Email attachments (optional)'
                      },
                      tags: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['name', 'value'],
                          properties: {
                            name: { type: 'string', example: 'category' },
                            value: { type: 'string', example: 'transactional' }
                          }
                        },
                        description: 'Resend-compatible tags for categorization (optional)'
                      }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Email sent successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['id', 'messageId'],
                      properties: {
                        id: {
                          type: 'string',
                          description: 'Unique email ID from Inbound',
                          example: 'email_abc123'
                        },
                        messageId: {
                          type: 'string',
                          description: 'AWS SES Message ID',
                          example: '010201234567-abc-def-ghi-jklmno'
                        }
                      }
                    }
                  }
                }
              },
              '400': {
                description: 'Invalid request body or validation error',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiError' }
                  }
                }
              },
              '401': {
                description: 'Authentication required - missing or invalid API key',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiError' }
                  }
                }
              },
              '403': {
                description: 'Forbidden - sender domain not owned or not verified',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiError' }
                  }
                }
              },
              '429': {
                description: 'Rate limit exceeded - email sending limit reached',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiError' }
                  }
                }
              },
              '500': {
                description: 'Internal server error or AWS SES failure',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiError' }
                  }
                }
              }
            }
          }
        }
      },
      tags: [
        {
          name: 'Emails',
          description: 'Send and manage emails'
        },
        {
          name: 'Domains',
          description: 'Manage email domains and DNS settings'
        },
        {
          name: 'Email Addresses',
          description: 'Manage email addresses for receiving emails'
        },
        {
          name: 'Endpoints',
          description: 'Configure webhooks and forwarding rules'
        }
      ]
    }

    console.log('✅ OpenAPI specification generated successfully')
    
    return NextResponse.json(spec, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Allow CORS for API docs viewers
      }
    })
  } catch (error) {
    console.error('❌ Error generating OpenAPI spec:', error)
    return NextResponse.json(
      { 
        error: 'Failed to generate OpenAPI specification', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}
