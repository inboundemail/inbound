import { authenticatedProcedure } from '../_lib/procedures';
import { UpdateEndpointInput, EndpointSchema } from './_schemas';
import { db } from '@/lib/db';
import { endpoints, svixApplications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { updateSvixEndpoint } from '@/lib/svix/client';

/**
 * PUT /api/v3/endpoints/{id}
 * 
 * Update endpoint configuration
 * - Updates endpoint name, description, active status, and config
 * - For webhooks: Syncs changes to Svix
 * 
 * @authenticated Required - Session or API key
 */
export const updateEndpoint = authenticatedProcedure
  .route({
    method: 'PUT',
    path: '/endpoints/{id}',
    summary: 'Update endpoint',
    description: 'Update endpoint configuration',
    tags: ['endpoints'],
  })
  .input(UpdateEndpointInput)
  .output(EndpointSchema)
  .handler(async ({ input, context }) => {
    const { id, ...updates } = input;
    const { userId } = context;
    
    // Verify ownership
    const [existing] = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.id, id))
      .limit(1);
    
    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Endpoint not found' });
    }
    
    if (existing.userId !== userId) {
      throw new ORPCError('FORBIDDEN', { message: 'Access denied' });
    }
    
    // For webhooks, sync to Svix if URL is being updated
    if (existing.type === 'webhook' && existing.svixEndpointId && updates.config?.url) {
      // Validate webhook URL (must be HTTPS in production)
      const url = new URL(updates.config.url);
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Webhook URLs must use HTTPS in production',
        });
      }
      
      const [svixApp] = await db
        .select()
        .from(svixApplications)
        .where(eq(svixApplications.userId, userId))
        .limit(1);
      
      if (svixApp) {
        try {
          await updateSvixEndpoint(
            svixApp.svixApplicationId,
            existing.svixEndpointId,
            { url: updates.config.url }
          );
        } catch (error: any) {
          console.error(`⚠️ updateEndpoint - Error syncing to Svix:`, error);
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to sync webhook URL to Svix. Please try again.',
          });
        }
      }
    }
    
    // Update endpoint
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };
    
    if (updates.config) {
      updateData.config = JSON.stringify(updates.config);
    }
    
    const [updated] = await db
      .update(endpoints)
      .set(updateData)
      .where(eq(endpoints.id, id))
      .returning();
    
    // Normalize legacy type values: 'email' -> 'email_forward'
    const normalizedType = updated.type === 'email' ? 'email_forward' : updated.type;
    
    return {
      id: updated.id,
      name: updated.name,
      type: normalizedType as 'webhook' | 'email_forward' | 'email_group',
      config: JSON.parse(updated.config),
      isActive: updated.isActive ?? true,
      description: updated.description,
      createdAt: updated.createdAt ? new Date(updated.createdAt) : new Date(),
      updatedAt: updated.updatedAt ? new Date(updated.updatedAt) : new Date(),
      svixEndpointId: updated.svixEndpointId,
      svixFormat: updated.svixFormat as 'full' | 'simple' | null,
    };
  });

