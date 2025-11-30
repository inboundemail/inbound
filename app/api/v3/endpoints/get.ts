import { authenticatedProcedure } from '../_lib/procedures';
import { GetEndpointInput, EndpointSchema, PortalUrlSchema } from './_schemas';
import { db } from '@/lib/db';
import { endpoints, svixApplications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { generateSvixPortalUrl } from '@/lib/svix/client';
import { z } from 'zod';

/**
 * GET /api/v3/endpoints/{id}
 * 
 * Get endpoint details with optional Svix portal URL
 * - Returns full endpoint configuration
 * - Optionally generates time-limited Svix portal URL (webhook only)
 * 
 * @authenticated Required - Session or API key
 */
export const getEndpoint = authenticatedProcedure
  .route({
    method: 'GET',
    path: '/endpoints/{id}',
    summary: 'Get endpoint',
    description: 'Get endpoint details with optional Svix portal URL',
    tags: ['endpoints'],
  })
  .input(GetEndpointInput)
  .output(z.object({
    endpoint: EndpointSchema,
    portal: PortalUrlSchema.nullable(),
  }))
  .handler(async ({ input, context }) => {
    const { id, includePortal } = input;
    const { userId } = context;
    
    // Get endpoint
    const [endpoint] = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.id, id))
      .limit(1);
    
    if (!endpoint) {
      throw new ORPCError('NOT_FOUND', { message: 'Endpoint not found' });
    }
    
    if (endpoint.userId !== userId) {
      throw new ORPCError('FORBIDDEN', { message: 'Access denied' });
    }
    
    // Generate portal URL if requested and webhook type
    let portal = null;
    if (includePortal && endpoint.type === 'webhook' && endpoint.svixEndpointId) {
      const [svixApp] = await db
        .select()
        .from(svixApplications)
        .where(eq(svixApplications.userId, userId))
        .limit(1);
      
      if (svixApp) {
        const portalUrl = await generateSvixPortalUrl(svixApp.svixApplicationId);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry
        
        portal = {
          url: portalUrl,
          expiresAt: expiresAt.toISOString(),
        };
      }
    }
    
    // Normalize legacy type values: 'email' -> 'email_forward'
    const normalizedType = endpoint.type === 'email' ? 'email_forward' : endpoint.type;
    // Safely parse endpoint config
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = endpoint.config ? JSON.parse(endpoint.config) : {};
    } catch {
      parsedConfig = {};
    }
    
    return {
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        type: normalizedType as 'webhook' | 'email_forward' | 'email_group',
        config: parsedConfig,
        isActive: endpoint.isActive ?? true,
        description: endpoint.description,
        createdAt: endpoint.createdAt ? new Date(endpoint.createdAt) : new Date(),
        updatedAt: endpoint.updatedAt ? new Date(endpoint.updatedAt) : new Date(),
        svixEndpointId: endpoint.svixEndpointId,
        svixFormat: endpoint.svixFormat as 'full' | 'simple' | null,
      },
      portal,
    };
  });

