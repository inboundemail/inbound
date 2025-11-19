import { authenticatedProcedure } from '../_lib/procedures';
import { z } from 'zod';
import { db } from '@/lib/db';
import { endpoints, emailAddresses, emailDomains, svixApplications, emailGroups } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { deleteSvixEndpoint } from '@/lib/svix/client';

/**
 * DELETE /api/v3/endpoints/{id}
 * 
 * Delete endpoint and remove from Svix
 * - Removes endpoint from database
 * - For webhooks: Deletes from Svix
 * - Returns count of affected email addresses
 * 
 * @authenticated Required - Session or API key
 */
export const deleteEndpoint = authenticatedProcedure
  .route({
    method: 'DELETE',
    path: '/endpoints/{id}',
    summary: 'Delete endpoint',
    description: 'Delete endpoint and remove from Svix',
    tags: ['endpoints'],
  })
  .input(z.object({ id: z.string() }))
  .output(z.object({
    success: z.boolean(),
    affectedEmailAddresses: z.number(),
  }))
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { userId } = context;
    
    // Verify ownership
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
    
    // For webhooks, delete from Svix
    if (endpoint.type === 'webhook' && endpoint.svixEndpointId) {
      const [svixApp] = await db
        .select()
        .from(svixApplications)
        .where(eq(svixApplications.userId, userId))
        .limit(1);
      
      if (svixApp) {
        try {
          await deleteSvixEndpoint(
            svixApp.svixApplicationId,
            endpoint.svixEndpointId
          );
        } catch (error: any) {
          console.error(`⚠️ deleteEndpoint - Error deleting from Svix (continuing with DB delete):`, error);
          // Continue with database deletion even if Svix deletion fails
        }
      }
    }
    
    // For email groups, delete group members first
    if (endpoint.type === 'email_group') {
      await db.delete(emailGroups).where(eq(emailGroups.endpointId, id));
    }
    
    // Count affected email addresses
    const affectedAddressesResult = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(eq(emailAddresses.endpointId, id));
    
    // Also check domains
    const affectedDomainsResult = await db
      .select({ count: count() })
      .from(emailDomains)
      .where(eq(emailDomains.catchAllEndpointId, id));
    
    const totalAffected = 
      (affectedAddressesResult[0]?.count || 0) + 
      (affectedDomainsResult[0]?.count || 0);
    
    // Delete endpoint
    await db.delete(endpoints).where(eq(endpoints.id, id));
    
    return {
      success: true,
      affectedEmailAddresses: totalAffected,
    };
  });

