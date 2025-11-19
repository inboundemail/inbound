import { Svix } from 'svix';
import type { ApplicationIn, EndpointIn, MessageIn } from 'svix';

// Singleton Svix client
let svixClient: Svix | null = null;

/**
 * Get or create the Svix client instance
 */
export function getSvixClient(): Svix {
  if (!svixClient) {
    const apiKey = process.env.SVIX_API_KEY;
    if (!apiKey) {
      throw new Error('SVIX_API_KEY is not configured');
    }
    svixClient = new Svix(apiKey);
  }
  return svixClient;
}

/**
 * Create a new Svix Application
 */
export async function createSvixApplication(userId: string, name: string) {
  const client = getSvixClient();
  const appData: ApplicationIn = {
    name,
    uid: `user-${userId}`, // Unique identifier for the application
  };

  try {
    const application = await client.application.create(appData);
    console.log(`✅ createSvixApplication - Created application: ${application.id} for user: ${userId}`);
    return application;
  } catch (error: any) {
    console.error(`❌ createSvixApplication - Error creating application:`, error);
    throw new Error(`Failed to create Svix application: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Get a Svix Application by ID
 */
export async function getSvixApplication(svixAppId: string) {
  const client = getSvixClient();
  try {
    const application = await client.application.get(svixAppId);
    return application;
  } catch (error: any) {
    console.error(`❌ getSvixApplication - Error getting application:`, error);
    throw new Error(`Failed to get Svix application: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Delete a Svix Application
 */
export async function deleteSvixApplication(svixAppId: string) {
  const client = getSvixClient();
  try {
    await client.application.delete(svixAppId);
    console.log(`✅ deleteSvixApplication - Deleted application: ${svixAppId}`);
  } catch (error: any) {
    console.error(`❌ deleteSvixApplication - Error deleting application:`, error);
    throw new Error(`Failed to delete Svix application: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Create a new Svix Endpoint
 */
export async function createSvixEndpoint(
  appId: string,
  url: string,
  eventTypes: string[]
) {
  const client = getSvixClient();
  const endpointData: EndpointIn = {
    url,
    version: 1,
    description: 'Inbound email webhook endpoint',
    // Use channels instead of filterTypes for Svix API v1
    channels: eventTypes,
  };

  try {
    const endpoint = await client.endpoint.create(appId, endpointData);
    console.log(`✅ createSvixEndpoint - Created endpoint: ${endpoint.id} for app: ${appId}`);
    return endpoint;
  } catch (error: any) {
    console.error(`❌ createSvixEndpoint - Error creating endpoint:`, error);
    console.error(`❌ createSvixEndpoint - Error body:`, error.body);
    console.error(`❌ createSvixEndpoint - Error code:`, error.code);
    const errorMessage = error.body?.detail || error.body?.message || error.message || 'Unknown error';
    throw new Error(`Failed to create Svix endpoint: ${errorMessage}`);
  }
}

/**
 * Update a Svix Endpoint
 */
export async function updateSvixEndpoint(
  appId: string,
  endpointId: string,
  updates: { url?: string; description?: string; disabled?: boolean }
) {
  const client = getSvixClient();
  try {
    const endpoint = await client.endpoint.update(appId, endpointId, updates as any);
    console.log(`✅ updateSvixEndpoint - Updated endpoint: ${endpointId}`);
    return endpoint;
  } catch (error: any) {
    console.error(`❌ updateSvixEndpoint - Error updating endpoint:`, error);
    throw new Error(`Failed to update Svix endpoint: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Delete a Svix Endpoint
 */
export async function deleteSvixEndpoint(appId: string, endpointId: string) {
  const client = getSvixClient();
  try {
    await client.endpoint.delete(appId, endpointId);
    console.log(`✅ deleteSvixEndpoint - Deleted endpoint: ${endpointId}`);
  } catch (error: any) {
    console.error(`❌ deleteSvixEndpoint - Error deleting endpoint:`, error);
    throw new Error(`Failed to delete Svix endpoint: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Send a message/event to Svix
 */
export async function sendSvixMessage(
  appId: string,
  eventType: string,
  payload: any
) {
  const client = getSvixClient();
  const messageData: MessageIn = {
    eventType,
    payload,
  };

  try {
    const message = await client.message.create(appId, messageData);
    console.log(`✅ sendSvixMessage - Sent message: ${message.id} for event: ${eventType}`);
    return message;
  } catch (error: any) {
    console.error(`❌ sendSvixMessage - Error sending message:`, error);
    throw new Error(`Failed to send Svix message: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Generate a time-limited portal URL for accessing Svix App Portal
 * Portal URLs expire after 1 hour
 */
export async function generateSvixPortalUrl(appId: string): Promise<string> {
  const client = getSvixClient();
  try {
    // Svix portal URL generation - this creates a time-limited URL
    // The URL allows access to the Svix App Portal for managing webhooks
    const portalAccess = await client.authentication.appPortalAccess(appId, {
      expiry: 3600, // 1 hour in seconds
    });
    
    console.log(`✅ generateSvixPortalUrl - Generated portal URL for app: ${appId}`);
    // The response should have a url property
    return typeof portalAccess === 'string' ? portalAccess : (portalAccess as any).url || portalAccess;
  } catch (error: any) {
    console.error(`❌ generateSvixPortalUrl - Error generating portal URL:`, error);
    throw new Error(`Failed to generate Svix portal URL: ${error.message || 'Unknown error'}`);
  }
}

