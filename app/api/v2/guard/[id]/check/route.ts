import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '../../../helper/main';
import { checkRuleMatch } from '@/lib/guard/rule-matcher';
import type { CheckRuleMatchRequest, CheckRuleMatchResponse } from '@/features/guard/types';

// POST /api/v2/guard/[id]/check - Check if a rule matches a structured email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await validateRequest(request)

    if ('error' in authResult) {

      const status = authResult.status || 401

      const headers: Record<string, string> = {}

      if (status === 429 && authResult.retryAfter) {

        headers['Retry-After'] = authResult.retryAfter.toString()

        headers['X-RateLimit-Limit'] = (authResult.limit || 0).toString()

        headers['X-RateLimit-Remaining'] = (authResult.remaining || 0).toString()

      }

      return NextResponse.json({ error: authResult.error }, { status, headers })

    }

    const { userId } = authResult

    const { id: ruleId } = await params;
    const body: CheckRuleMatchRequest = await request.json();

    if (!body.structuredEmailId) {
      return NextResponse.json(
        { error: 'Missing required field: structuredEmailId' },
        { status: 400 }
      );
    }

    // Call the lib function
    const result = await checkRuleMatch(
      ruleId,
      body.structuredEmailId,
      userId
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking rule match:', error);
    return NextResponse.json(
      { 
        matched: false,
        error: error instanceof Error ? error.message : 'Failed to check rule match'
      } as CheckRuleMatchResponse,
      { status: 500 }
    );
  }
}

