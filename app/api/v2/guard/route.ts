/**
 * Guard Rules API v2
 * 
 * Manages email filtering rules that allow users to define actions (allow, block, route)
 * based on email criteria. Supports both explicit pattern matching and AI-powered evaluation.
 * 
 * Endpoints:
 * - GET    /api/v2/guard - List all guard rules with filtering and pagination
 * - POST   /api/v2/guard - Create a new guard rule
 * 
 * Guard rules are evaluated by priority (highest first) before normal email routing.
 * When a rule matches, its action is executed immediately, bypassing lower priority rules.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guardRules } from '@/lib/db/schema';
import { eq, and, desc, like, or, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { validateRequest } from '../helper/main';
import type { CreateGuardRuleRequest } from '@/features/guard/types';

// GET /api/v2/guard - List all guard rules for the user
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateRequest(request);
    if ('error' in authResult) {
      const status = authResult.status || 401
      const headers: Record<string, string> = {}
      if (status === 429 && authResult.retryAfter) {
        headers['Retry-After'] = authResult.retryAfter.toString()
        headers['X-RateLimit-Limit'] = (authResult.limit || 0).toString()
        headers['X-RateLimit-Remaining'] = (authResult.remaining || 0).toString()
      }
      return NextResponse.json({
        success: false,
        error: authResult.error
      }, { status, headers });
    }
    const { userId } = authResult

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const type = searchParams.get('type'); // 'explicit' | 'ai_prompt'
    const isActive = searchParams.get('isActive'); // 'true' | 'false'
    // Parse and validate pagination parameters to prevent NaN values
    const parsePositiveInt = (value: string | null, defaultValue: number, maxValue?: number): number => {
      const parsed = parseInt(value || String(defaultValue));
      if (isNaN(parsed) || parsed < 0) {
        return defaultValue;
      }
      return maxValue ? Math.min(parsed, maxValue) : parsed;
    };
    
    const limit = parsePositiveInt(searchParams.get('limit'), 50, 100);
    const offset = parsePositiveInt(searchParams.get('offset'), 0);

    // Build where conditions
    const conditions = [eq(guardRules.userId, userId)];

    if (search) {
      conditions.push(
        or(
          like(guardRules.name, `%${search}%`),
          like(guardRules.description, `%${search}%`)
        )!
      );
    }

    if (type) {
      conditions.push(eq(guardRules.type, type));
    }

    if (isActive !== null && isActive !== undefined) {
      // Handle various boolean-like string values
      const boolValue = isActive === 'true' || isActive === '1';
      conditions.push(eq(guardRules.isActive, boolValue));
    }

    // Fetch rules with pagination
    const rules = await db
      .select()
      .from(guardRules)
      .where(and(...conditions))
      .orderBy(desc(guardRules.priority), desc(guardRules.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(guardRules)
      .where(and(...conditions));
    
    const total = Number(totalResult[0]?.count) || 0;

    // Return v2 API spec envelope format
    return NextResponse.json({
      success: true,
      data: rules,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rules.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching guard rules:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch guard rules' 
      },
      { status: 500 }
    );
  }
}

// POST /api/v2/guard - Create a new guard rule
export async function POST(request: NextRequest) {
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

    const body: CreateGuardRuleRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.type || !body.config || !body.action) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required fields: name, type, config, and action are required' 
        },
        { status: 400 }
      );
    }

    // Validate rule type
    if (body.type !== 'explicit' && body.type !== 'ai_prompt') {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid rule type. Must be "explicit" or "ai_prompt"' 
        },
        { status: 400 }
      );
    }

    // Validate action config
    if (!['allow', 'block', 'route'].includes(body.action.action)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid action. Must be "allow", "block", or "route"' 
        },
        { status: 400 }
      );
    }

    // Validate route action has endpoint
    if (body.action.action === 'route' && !body.action.endpointId) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Endpoint ID is required when action is "route"' 
        },
        { status: 400 }
      );
    }

    // Normalize and validate priority (non-negative)
    const normalizedPriority = Math.max(0, Number(body.priority || 0))

    // Create the rule with consistent field naming (actions -> action in storage)
    const newRule = {
      id: nanoid(),
      userId: userId,
      name: body.name,
      description: body.description || null,
      type: body.type,
      config: JSON.stringify(body.config),
      isActive: true,
      priority: normalizedPriority,
      actions: JSON.stringify(body.action), // Note: schema uses 'actions' field
      triggerCount: 0,
      lastTriggeredAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [createdRule] = await db
      .insert(guardRules)
      .values(newRule)
      .returning();

    // Return v2 API spec envelope format
    return NextResponse.json({ 
      success: true,
      data: createdRule 
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating guard rule:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create guard rule' 
      },
      { status: 500 }
    );
  }
}

// Export types for use in hooks (v2 API envelope format)
export interface GetGuardRulesResponse {
  success: true;
  data: Array<typeof guardRules.$inferSelect>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Note: CreateGuardRuleResponse is now handled directly in the hook
// The hook extracts .data from the envelope and returns GuardRule type

