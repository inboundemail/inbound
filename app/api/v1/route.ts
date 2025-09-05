import { NextRequest, NextResponse } from 'next/server'
import { getOpenAPISpec } from '@/lib/openapi/spec'

export async function GET(request: NextRequest) {
  try {
    const spec = await getOpenAPISpec()
    
    return NextResponse.json(spec, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  } catch (error) {
    console.error('Error generating OpenAPI spec:', error)
    return NextResponse.json(
      { error: 'Failed to generate API specification' },
      { status: 500 }
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
} 