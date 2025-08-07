import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    version: '1.1',
    message: 'Inbound API v1.1 - Enhanced email management with routing',
    endpoints: [
      '/api/v1.1/endpoints',
      '/api/v1.1/endpoints/{id}',
      '/api/v1.1/email-addresses',
      '/api/v1.1/email-addresses/{id}',
      '/api/v1.1/domains',
      '/api/v1.1/domains/{id}/catch-all'
    ],
    documentation: 'https://docs.inbound.new/api/v1.1'
  })
} 