/**
 * Guard Rule Detail API v2
 * 
 * Manages individual guard rules with full CRUD operations.
 * 
 * Endpoints:
 * - GET    /api/v2/guard/[id] - Retrieve a single guard rule
 * - PUT    /api/v2/guard/[id] - Update a guard rule
 * - DELETE /api/v2/guard/[id] - Delete a guard rule
 * 
 * All operations are scoped to the authenticated user's rules only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guardRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { validateRequest } from '../../helper/main';
import type { UpdateGuardRuleRequest, RuleActionConfig, RuleConfig } from '@/features/guard/types';

// GET /api/v2/guard/[id] - Get a single guard rule
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await validateRequest(request)

    if ('error' in result) {

      const status = result.status || 401

      const headers: Record<string, string> = {}

      if (status === 429 && result.retryAfter) {

        headers['Retry-After'] = result.retryAfter.toString()

        headers['X-RateLimit-Limit'] = (result.limit || 0).toString()

        headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()

      }

      return NextResponse.json({ error: result.error }, { status, headers })

    }

    const { userId } = result

    const { id: ruleId } = await params;

    const [rule] = await db
      .select()
      .from(guardRules)
      .where(and(
        eq(guardRules.id, ruleId),
        eq(guardRules.userId, userId)
      ))
      .limit(1);

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Error fetching guard rule:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guard rule' },
      { status: 500 }
    );
  }
}

// PUT /api/v2/guard/[id] - Update a guard rule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await validateRequest(request)

    if ('error' in result) {

      const status = result.status || 401

      const headers: Record<string, string> = {}

      if (status === 429 && result.retryAfter) {

        headers['Retry-After'] = result.retryAfter.toString()

        headers['X-RateLimit-Limit'] = (result.limit || 0).toString()

        headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()

      }

      return NextResponse.json({ error: result.error }, { status, headers })

    }

    const { userId } = result

    const { id: ruleId } = await params;
    const body: UpdateGuardRuleRequest = await request.json();

    // Check if rule exists and belongs to user
    const [existingRule] = await db
      .select()
      .from(guardRules)
      .where(and(
        eq(guardRules.id, ruleId),
        eq(guardRules.userId, userId)
      ))
      .limit(1);

    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Build update object with proper typing
    const updateData: Partial<{
      name: string;
      description: string | null;
      config: string;
      isActive: boolean;
      priority: number;
      actions: string;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    // Ensure config is stringified once (no double-serialization)
    if (body.config !== undefined) {
      updateData.config = typeof body.config === 'string' 
        ? body.config 
        : JSON.stringify(body.config);
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.priority !== undefined) updateData.priority = Math.max(0, Number(body.priority));
    // Ensure actions is stringified once (no double-serialization)
    if (body.action !== undefined) {
      updateData.actions = typeof body.action === 'string'
        ? body.action
        : JSON.stringify(body.action);
    }

    // Update the rule
    const [updatedRule] = await db
      .update(guardRules)
      .set(updateData)
      .where(and(
        eq(guardRules.id, ruleId),
        eq(guardRules.userId, userId)
      ))
      .returning();

    return NextResponse.json(updatedRule);
  } catch (error) {
    console.error('Error updating guard rule:', error);
    return NextResponse.json(
      { error: 'Failed to update guard rule' },
      { status: 500 }
    );
  }
}

// DELETE /api/v2/guard/[id] - Delete a guard rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await validateRequest(request)

    if ('error' in result) {

      const status = result.status || 401

      const headers: Record<string, string> = {}

      if (status === 429 && result.retryAfter) {

        headers['Retry-After'] = result.retryAfter.toString()

        headers['X-RateLimit-Limit'] = (result.limit || 0).toString()

        headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()

      }

      return NextResponse.json({ error: result.error }, { status, headers })

    }

    const { userId } = result

    const { id: ruleId } = await params;

    // Check if rule exists and belongs to user
    const [existingRule] = await db
      .select()
      .from(guardRules)
      .where(and(
        eq(guardRules.id, ruleId),
        eq(guardRules.userId, userId)
      ))
      .limit(1);

    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Delete the rule
    await db
      .delete(guardRules)
      .where(and(
        eq(guardRules.id, ruleId),
        eq(guardRules.userId, userId)
      ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting guard rule:', error);
    return NextResponse.json(
      { error: 'Failed to delete guard rule' },
      { status: 500 }
    );
  }
}

// Export types
export type GetGuardRuleResponse = typeof guardRules.$inferSelect;
export type UpdateGuardRuleResponse = typeof guardRules.$inferSelect;
export interface DeleteGuardRuleResponse {
  success: boolean;
}

