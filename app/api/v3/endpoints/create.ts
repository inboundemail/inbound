import { authenticatedProcedure } from '../_lib/procedures';
import { CreateEndpointInput, EndpointSchema } from './_schemas';
import { db } from '@/lib/db';
import { endpoints, emailGroups } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { ORPCError } from '@orpc/server';
import { getOrCreateSvixApplication } from '@/lib/svix/helpers';
import { createSvixEndpoint, deleteSvixEndpoint } from '@/lib/svix/client';
import { eq } from 'drizzle-orm';

/**
 * POST /api/v3/endpoints
 * 
 * Create a new endpoint (webhook, email forward, or email group)
 * - For webhook types: Creates Svix Application + Endpoint automatically
 * - For email_forward: Direct email forwarding configuration
 * - For email_group: Stores multiple email addresses for group forwarding
 * 
 * @authenticated Required - Session or API key
 */
export const createEndpoint = authenticatedProcedure
  .route({
    method: 'POST',
    path: '/endpoints',
    summary: 'Create endpoint',
    description: 'Create a new endpoint (webhook, email forward, or email group)',
    tags: ['endpoints'],
    successStatus: 201,
  })
  .input(CreateEndpointInput)
  .output(EndpointSchema)
  .handler(async ({ input, context }) => {
    const { userId } = context;
    
    // Normalize legacy type 'email' -> 'email_forward' for v2 compatibility
    const normalizedType = input.type === 'email' ? 'email_forward' : input.type;
    
    let svixEndpointId: string | null = null;
    let svixAppId: string | null = null;
    let endpointId: string | null = null;
    
    try {
      // For webhook types, create Svix endpoint first
      if (normalizedType === 'webhook' && input.type === 'webhook') {
        // Validate webhook URL (must be HTTPS in production)
        const url = new URL(input.config.url);
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
          throw new ORPCError('BAD_REQUEST', {
            message: 'Webhook URLs must use HTTPS in production',
          });
        }
        
        // Get or create Svix Application
        const svixApp = await getOrCreateSvixApplication(userId);
        svixAppId = svixApp.svixApplicationId;
        
        // Create Svix Endpoint
        const svixEndpoint = await createSvixEndpoint(
          svixApp.svixApplicationId,
          input.config.url,
          ['email.received']
        );
        
        svixEndpointId = svixEndpoint.id;
      }
      
      // Get svixFormat based on type
      let svixFormat: 'full' | 'simple' | null = null;
      if (normalizedType === 'webhook' && input.type === 'webhook') {
        svixFormat = input.config.format;
      }
      
      // Create endpoint record (using normalized type)
      endpointId = nanoid();
      const [endpoint] = await db.insert(endpoints).values({
        id: endpointId,
        name: input.name,
        type: normalizedType,
        config: JSON.stringify(input.config),
        description: input.description || null,
        isActive: input.isActive ?? true,
        userId,
        svixEndpointId,
        svixFormat,
      }).returning();
      
      // For email groups, insert group emails
      if (normalizedType === 'email_group' && input.type === 'email_group') {
        await Promise.all(
          input.config.emails.map((email: string) =>
            db.insert(emailGroups).values({
              id: nanoid(),
              endpointId: endpoint.id,
              emailAddress: email,
            })
          )
        );
      }
      
      // Return only fields defined in EndpointSchema (exclude userId, use normalized type)
      const result = {
        id: endpoint.id,
        name: endpoint.name,
        type: normalizedType as 'webhook' | 'email_forward' | 'email_group',
        config: JSON.parse(endpoint.config),
        isActive: endpoint.isActive ?? true,
        description: endpoint.description,
        createdAt: endpoint.createdAt ? new Date(endpoint.createdAt) : new Date(),
        updatedAt: endpoint.updatedAt ? new Date(endpoint.updatedAt) : new Date(),
        svixEndpointId: endpoint.svixEndpointId,
        svixFormat: endpoint.svixFormat as 'full' | 'simple' | null,
      };
      
      console.log('✅ createEndpoint - Returning result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      console.error('❌ createEndpoint - Error:', error);
      
      // If this is already an ORPCError, re-throw it
      if (error.code && error.status) {
        throw error;
      }
      
      // Rollback: If Svix endpoint was created but DB insert failed, delete Svix endpoint
      if (svixEndpointId && svixAppId) {
        try {
          console.log(`🔄 createEndpoint - Rolling back Svix endpoint: ${svixEndpointId}`);
          await deleteSvixEndpoint(svixAppId, svixEndpointId);
        } catch (rollbackError) {
          console.error('❌ createEndpoint - Failed to rollback Svix endpoint:', rollbackError);
        }
      }
      
      // Rollback: If endpoint was created but email groups failed, delete endpoint
      if (endpointId && normalizedType === 'email_group') {
        try {
          console.log(`🔄 createEndpoint - Rolling back endpoint: ${endpointId}`);
          await db.delete(endpoints).where(eq(endpoints.id, endpointId));
        } catch (rollbackError) {
          console.error('❌ createEndpoint - Failed to rollback endpoint:', rollbackError);
        }
      }
      
      // More specific error message based on the error
      const errorMessage = error.message?.includes('Svix') 
        ? 'Failed to create webhook endpoint with Svix. Please check your webhook URL and try again.'
        : 'Failed to create endpoint. Please try again.';
      
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: errorMessage,
      });
    }
  });

