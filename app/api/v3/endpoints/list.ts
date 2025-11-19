import { authenticatedProcedure } from '../_lib/procedures';
import { ListEndpointsInput, EndpointSchema } from './_schemas';
import { db } from '@/lib/db';
import { endpoints } from '@/lib/db/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { z } from 'zod';

/**
 * GET /api/v3/endpoints
 * 
 * List all endpoints with optional filtering
 * - Supports pagination via limit/offset
 * - Can filter by type and active status
 * 
 * @authenticated Required - Session or API key
 */
export const listEndpoints = authenticatedProcedure
  .route({
    method: 'GET',
    path: '/endpoints',
    summary: 'List endpoints',
    description: 'List all endpoints with optional filtering',
    tags: ['endpoints'],
  })
  .input(ListEndpointsInput)
  .output(z.object({
    data: z.array(EndpointSchema),
    pagination: z.object({
      limit: z.number(),
      offset: z.number(),
      total: z.number(),
      hasMore: z.boolean(),
    }),
  }))
  .handler(async ({ input, context }) => {
    const { userId } = context;
    const { limit, offset, type, active } = input;
    
    try {
      // Normalize legacy type filter 'email' -> 'email_forward'
      const normalizedTypeFilter = type === 'email' ? 'email_forward' : type;
      
      // Build where conditions
      const conditions = [eq(endpoints.userId, userId)];
      if (normalizedTypeFilter) conditions.push(eq(endpoints.type, normalizedTypeFilter));
      if (active !== undefined) conditions.push(eq(endpoints.isActive, active));
      
      // Create where clause (handle single condition)
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      
      // Query endpoints
      const results = await db
        .select()
        .from(endpoints)
        .where(whereClause)
        .limit(limit)
        .offset(offset);
      
      // Get total count using raw SQL for compatibility
      const countResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(endpoints)
        .where(whereClause);
      
      const total = Number(countResult[0]?.count) || 0;
      
      return {
        data: results.map(e => {
          // Normalize legacy type values: 'email' -> 'email_forward'
          const normalizedType = e.type === 'email' ? 'email_forward' : e.type;
          
          return {
            id: e.id,
            name: e.name,
            type: normalizedType as 'webhook' | 'email_forward' | 'email_group',
            config: JSON.parse(e.config),
            isActive: e.isActive ?? true,
            description: e.description,
            createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
            updatedAt: e.updatedAt ? new Date(e.updatedAt) : new Date(),
            svixEndpointId: e.svixEndpointId,
            svixFormat: e.svixFormat as 'full' | 'simple' | null,
          };
        }),
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      };
    } catch (error: any) {
      console.error('❌ listEndpoints - Error:', error);
      throw error;
    }
  });

