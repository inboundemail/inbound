import { authenticatedProcedure } from '../_lib/procedures';
import { z } from 'zod';
import { db } from '@/lib/db';
import { endpoints, svixApplications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { sendSvixMessage } from '@/lib/svix/client';

/**
 * POST /api/v3/endpoints/{id}/send
 * 
 * Send test webhook event with synthetic data
 * - Generates test payload with sample email data
 * - Sends to Svix for delivery to endpoint
 * - Useful for testing webhook endpoints
 * 
 * @authenticated Required - Session or API key
 */
export const sendTestEvent = authenticatedProcedure
  .route({
    method: 'POST',
    path: '/endpoints/{id}/send',
    summary: 'Send test event',
    description: 'Send test webhook event with synthetic data',
    tags: ['endpoints'],
  })
  .input(z.object({
    id: z.string(),
    eventType: z.string().default('email.received'),
  }))
  .output(z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
  }))
  .handler(async ({ input, context }) => {
    const { id, eventType } = input;
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
    
    if (endpoint.type !== 'webhook') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Test events only supported for webhook endpoints',
      });
    }
    
    if (!endpoint.svixEndpointId) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'This webhook endpoint is not configured with Svix. Only v3 webhook endpoints support test events.',
      });
    }
    
    // Get Svix application
    const [svixApp] = await db
      .select()
      .from(svixApplications)
      .where(eq(svixApplications.userId, userId))
      .limit(1);
    
    if (!svixApp) {
      throw new ORPCError('NOT_FOUND', { message: 'Svix application not found for user' });
    }
    
    // Parse endpoint config to determine format
    const config = JSON.parse(endpoint.config);
    const format = endpoint.svixFormat || 'full';
    
    // Generate test payload based on format
    const testPayload = format === 'simple' ? {
      id: 'test_' + Date.now(),
      type: eventType,
      timestamp: new Date().toISOString(),
      email: {
        from: 'Test Sender <test@example.com>',
        to: 'recipient@yourdomain.com',
        subject: 'Test Email from Inbound',
        text: 'This is a test email to verify your webhook endpoint is working correctly.',
        hasAttachments: false,
        attachmentCount: 0,
      },
    } : {
      id: 'test_' + Date.now(),
      type: eventType,
      timestamp: new Date().toISOString(),
      email: {
        messageId: 'test_msg_' + Date.now(),
        from: { text: 'Test Sender <test@example.com>', addresses: [{ name: 'Test Sender', address: 'test@example.com' }] },
        to: { text: 'recipient@yourdomain.com', addresses: [{ name: null, address: 'recipient@yourdomain.com' }] },
        subject: 'Test Email from Inbound',
        textBody: 'This is a test email to verify your webhook endpoint is working correctly.',
        htmlBody: '<p>This is a test email to verify your webhook endpoint is working correctly.</p>',
        date: new Date().toISOString(),
        attachments: [],
        headers: {},
      },
    };
    
    // Send to Svix
    try {
      const response = await sendSvixMessage(
        svixApp.svixApplicationId,
        eventType,
        testPayload
      );
      
      return {
        success: true,
        messageId: response.id,
      };
    } catch (error: any) {
      console.error('❌ sendTestEvent - Error sending to Svix:', error);
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to send test event. Please try again.',
      });
    }
  });

