/**
 * Comprehensive tests for v3 Endpoints API
 * Tests all endpoint types (webhook, email_forward, email_group) and operations
 * Requires INBOUND_API_KEY environment variable
 */

// @ts-ignore - bun:test is a Bun-specific module not recognized by TypeScript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '@/lib/db';
import { endpoints, emailGroups, svixApplications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.INBOUND_API_KEY;

if (!API_KEY) {
  console.error('❌ INBOUND_API_KEY environment variable is required');
  process.exit(1);
}

// Helper function to make authenticated API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}/api/v3${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...options.headers,
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  return { response, data };
}

// Test data cleanup
const createdEndpointIds: string[] = [];

afterAll(async () => {
  console.log('🧹 Cleaning up test data...');
  for (const endpointId of createdEndpointIds) {
    try {
      // Try to delete via API first
      await apiRequest(`/endpoints/${endpointId}`, { method: 'DELETE' });
    } catch (error) {
      // If API delete fails, try direct DB cleanup
      try {
        await db.delete(endpoints).where(eq(endpoints.id, endpointId));
        await db.delete(emailGroups).where(eq(emailGroups.endpointId, endpointId));
      } catch (dbError) {
        console.error(`⚠️ Failed to cleanup endpoint ${endpointId}:`, dbError);
      }
    }
  }
  console.log('✅ Cleanup complete');
});

describe('📡 v3 Endpoints API Tests', () => {
  let webhookEndpointId: string;
  let emailForwardEndpointId: string;
  let emailGroupEndpointId: string;

  describe('POST /api/v3/endpoints - Create Endpoints', () => {
    test('should create a webhook endpoint with Svix integration', async () => {
      console.log('🔷 Testing webhook endpoint creation...');

      const endpointData = {
        type: 'webhook' as const,
        name: 'Test Webhook Endpoint',
        description: 'Test webhook for v3 API',
        isActive: true,
        config: {
          url: 'https://webhook.site/unique-test-id',
          format: 'full' as const,
          timeout: 30,
        },
      };

      const { response, data } = await apiRequest('/endpoints', {
        method: 'POST',
        body: JSON.stringify(endpointData),
      });

      console.log('📧 Response status:', response.status);
      console.log('📧 Response data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.type).toBe('webhook');
      expect(data.name).toBe(endpointData.name);
      expect(data.svixEndpointId).toBeDefined();
      expect(data.svixFormat).toBe('full');
      expect(data.config.url).toBe(endpointData.config.url);

      webhookEndpointId = data.id;
      createdEndpointIds.push(webhookEndpointId);
    });

    test('should create a webhook endpoint with simple format', async () => {
      console.log('🔷 Testing webhook endpoint creation with simple format...');

      const endpointData = {
        type: 'webhook' as const,
        name: 'Test Simple Webhook',
        config: {
          url: 'https://webhook.site/unique-test-id-2',
          format: 'simple' as const,
        },
      };

      const { response, data } = await apiRequest('/endpoints', {
        method: 'POST',
        body: JSON.stringify(endpointData),
      });

      expect(response.status).toBe(201);
      expect(data.svixFormat).toBe('simple');
      expect(data.svixEndpointId).toBeDefined();

      createdEndpointIds.push(data.id);
    });

    test('should create an email forward endpoint', async () => {
      console.log('📧 Testing email forward endpoint creation...');

      const endpointData = {
        type: 'email_forward' as const,
        name: 'Test Email Forward',
        description: 'Test email forward endpoint',
        config: {
          forwardTo: 'test@example.com',
        },
      };

      const { response, data } = await apiRequest('/endpoints', {
        method: 'POST',
        body: JSON.stringify(endpointData),
      });

      console.log('📧 Response status:', response.status);
      console.log('📧 Response data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.type).toBe('email_forward');
      expect(data.name).toBe(endpointData.name);
      expect(data.svixEndpointId).toBeNull();
      expect(data.config.forwardTo).toBe(endpointData.config.forwardTo);

      emailForwardEndpointId = data.id;
      createdEndpointIds.push(emailForwardEndpointId);
    });

    test('should create an email group endpoint', async () => {
      console.log('👥 Testing email group endpoint creation...');

      const endpointData = {
        type: 'email_group' as const,
        name: 'Test Email Group',
        description: 'Test email group endpoint',
        config: {
          emails: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
        },
      };

      const { response, data } = await apiRequest('/endpoints', {
        method: 'POST',
        body: JSON.stringify(endpointData),
      });

      console.log('📧 Response status:', response.status);
      console.log('📧 Response data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.type).toBe('email_group');
      expect(data.name).toBe(endpointData.name);
      expect(data.svixEndpointId).toBeNull();

      emailGroupEndpointId = data.id;
      createdEndpointIds.push(emailGroupEndpointId);
    });

    test('should reject invalid webhook URL', async () => {
      console.log('❌ Testing invalid webhook URL rejection...');

      const endpointData = {
        type: 'webhook' as const,
        name: 'Invalid Webhook',
        config: {
          url: 'not-a-valid-url',
          format: 'full' as const,
        },
      };

      const { response } = await apiRequest('/endpoints', {
        method: 'POST',
        body: JSON.stringify(endpointData),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/v3/endpoints - List Endpoints', () => {
    test('should list all endpoints with pagination', async () => {
      console.log('📋 Testing endpoint listing...');

      const { response, data } = await apiRequest('/endpoints?limit=10&offset=0');

      console.log('📧 Response status:', response.status);
      console.log('📧 Total endpoints:', data.pagination?.total);

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.offset).toBe(0);
      expect(data.pagination.total).toBeGreaterThanOrEqual(0);
    });

    test('should filter endpoints by type', async () => {
      console.log('🔍 Testing endpoint filtering by type...');

      const { response, data } = await apiRequest('/endpoints?type=webhook&limit=10');

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      if (data.data.length > 0) {
        expect(data.data.every((e: any) => e.type === 'webhook')).toBe(true);
      }
    });

    test('should filter endpoints by active status', async () => {
      console.log('🔍 Testing endpoint filtering by active status...');

      const { response, data } = await apiRequest('/endpoints?active=true&limit=10');

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      if (data.data.length > 0) {
        expect(data.data.every((e: any) => e.isActive === true)).toBe(true);
      }
    });
  });

  describe('GET /api/v3/endpoints/{id} - Get Endpoint', () => {
    test('should get webhook endpoint details', async () => {
      if (!webhookEndpointId) {
        console.log('⏭️ Skipping - webhook endpoint not created');
        return;
      }

      console.log('🔍 Testing webhook endpoint retrieval...');

      const { response, data } = await apiRequest(`/endpoints/${webhookEndpointId}`);

      console.log('📧 Response status:', response.status);
      console.log('📧 Response data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(200);
      expect(data.endpoint).toBeDefined();
      expect(data.endpoint.id).toBe(webhookEndpointId);
      expect(data.endpoint.type).toBe('webhook');
      expect(data.endpoint.svixEndpointId).toBeDefined();
    });

    test('should get webhook endpoint with portal URL', async () => {
      if (!webhookEndpointId) {
        console.log('⏭️ Skipping - webhook endpoint not created');
        return;
      }

      console.log('🔗 Testing portal URL generation...');

      const { response, data } = await apiRequest(
        `/endpoints/${webhookEndpointId}?includePortal=true`
      );

      console.log('📧 Response status:', response.status);
      console.log('📧 Portal URL:', data.portal?.url);

      expect(response.status).toBe(200);
      expect(data.endpoint).toBeDefined();
      if (data.portal) {
        expect(data.portal.url).toBeDefined();
        expect(data.portal.expiresAt).toBeDefined();
        expect(new Date(data.portal.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });

    test('should return 404 for non-existent endpoint', async () => {
      console.log('❌ Testing 404 for non-existent endpoint...');

      const fakeId = 'non-existent-id-12345';
      const { response } = await apiRequest(`/endpoints/${fakeId}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/v3/endpoints/{id} - Update Endpoint', () => {
    test('should update webhook endpoint name and description', async () => {
      if (!webhookEndpointId) {
        console.log('⏭️ Skipping - webhook endpoint not created');
        return;
      }

      console.log('✏️ Testing webhook endpoint update...');

      const updateData = {
        id: webhookEndpointId,
        name: 'Updated Webhook Name',
        description: 'Updated description',
      };

      const { response, data } = await apiRequest(`/endpoints/${webhookEndpointId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      console.log('📧 Response status:', response.status);
      console.log('📧 Updated data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(200);
      expect(data.name).toBe(updateData.name);
      expect(data.description).toBe(updateData.description);
    });

    test('should update webhook endpoint URL and sync to Svix', async () => {
      if (!webhookEndpointId) {
        console.log('⏭️ Skipping - webhook endpoint not created');
        return;
      }

      console.log('🔄 Testing webhook URL update with Svix sync...');

      const updateData = {
        id: webhookEndpointId,
        config: {
          url: 'https://webhook.site/updated-test-id',
          format: 'full' as const,
          timeout: 45,
        },
      };

      const { response, data } = await apiRequest(`/endpoints/${webhookEndpointId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      expect(data.config.url).toBe(updateData.config.url);
      expect(data.config.timeout).toBe(45);
    });

    test('should update email forward endpoint', async () => {
      if (!emailForwardEndpointId) {
        console.log('⏭️ Skipping - email forward endpoint not created');
        return;
      }

      console.log('✏️ Testing email forward endpoint update...');

      const updateData = {
        id: emailForwardEndpointId,
        name: 'Updated Email Forward',
        config: {
          forwardTo: 'updated@example.com',
        },
      };

      const { response, data } = await apiRequest(`/endpoints/${emailForwardEndpointId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      expect(data.name).toBe(updateData.name);
      expect(data.config.forwardTo).toBe(updateData.config.forwardTo);
    });

    test('should toggle endpoint active status', async () => {
      if (!webhookEndpointId) {
        console.log('⏭️ Skipping - webhook endpoint not created');
        return;
      }

      console.log('🔄 Testing endpoint active status toggle...');

      // First, get current status
      const { data: currentData } = await apiRequest(`/endpoints/${webhookEndpointId}`);
      const currentStatus = currentData.endpoint.isActive;

      // Toggle status
      const updateData = {
        id: webhookEndpointId,
        isActive: !currentStatus,
      };

      const { response, data } = await apiRequest(`/endpoints/${webhookEndpointId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      expect(data.isActive).toBe(!currentStatus);

      // Toggle back
      await apiRequest(`/endpoints/${webhookEndpointId}`, {
        method: 'PUT',
        body: JSON.stringify({ id: webhookEndpointId, isActive: currentStatus }),
      });
    });
  });

  describe('POST /api/v3/endpoints/{id}/send - Send Test Event', () => {
    test('should send test event to webhook endpoint', async () => {
      if (!webhookEndpointId) {
        console.log('⏭️ Skipping - webhook endpoint not created');
        return;
      }

      console.log('📤 Testing test event sending...');

      const { response, data } = await apiRequest(`/endpoints/${webhookEndpointId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          eventType: 'email.received',
        }),
      });

      console.log('📧 Response status:', response.status);
      console.log('📧 Response data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.messageId).toBeDefined();
    });

    test('should reject test event for non-webhook endpoint', async () => {
      if (!emailForwardEndpointId) {
        console.log('⏭️ Skipping - email forward endpoint not created');
        return;
      }

      console.log('❌ Testing test event rejection for non-webhook...');

      const { response } = await apiRequest(`/endpoints/${emailForwardEndpointId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          eventType: 'email.received',
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('DELETE /api/v3/endpoints/{id} - Delete Endpoint', () => {
    test('should delete email forward endpoint', async () => {
      if (!emailForwardEndpointId) {
        console.log('⏭️ Skipping - email forward endpoint not created');
        return;
      }

      console.log('🗑️ Testing email forward endpoint deletion...');

      const { response, data } = await apiRequest(`/endpoints/${emailForwardEndpointId}`, {
        method: 'DELETE',
      });

      console.log('📧 Response status:', response.status);
      console.log('📧 Response data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(typeof data.affectedEmailAddresses).toBe('number');

      // Remove from cleanup list since it's already deleted
      createdEndpointIds.splice(createdEndpointIds.indexOf(emailForwardEndpointId), 1);

      // Verify it's deleted
      const { response: getResponse } = await apiRequest(`/endpoints/${emailForwardEndpointId}`);
      expect(getResponse.status).toBe(404);
    });

    test('should delete email group endpoint', async () => {
      if (!emailGroupEndpointId) {
        console.log('⏭️ Skipping - email group endpoint not created');
        return;
      }

      console.log('🗑️ Testing email group endpoint deletion...');

      const { response, data } = await apiRequest(`/endpoints/${emailGroupEndpointId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Remove from cleanup list
      createdEndpointIds.splice(createdEndpointIds.indexOf(emailGroupEndpointId), 1);
    });

    test('should delete webhook endpoint and remove from Svix', async () => {
      if (!webhookEndpointId) {
        console.log('⏭️ Skipping - webhook endpoint not created');
        return;
      }

      console.log('🗑️ Testing webhook endpoint deletion with Svix cleanup...');

      const { response, data } = await apiRequest(`/endpoints/${webhookEndpointId}`, {
        method: 'DELETE',
      });

      console.log('📧 Response status:', response.status);
      console.log('📧 Response data:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Remove from cleanup list
      createdEndpointIds.splice(createdEndpointIds.indexOf(webhookEndpointId), 1);

      // Verify it's deleted
      const { response: getResponse } = await apiRequest(`/endpoints/${webhookEndpointId}`);
      expect(getResponse.status).toBe(404);
    });
  });

  describe('🔐 Authentication & Authorization', () => {
    test('should reject requests without API key', async () => {
      console.log('🔒 Testing authentication requirement...');

      const response = await fetch(`${API_BASE_URL}/api/v3/endpoints`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(401);
    });

    test('should reject requests with invalid API key', async () => {
      console.log('🔒 Testing invalid API key rejection...');

      const response = await fetch(`${API_BASE_URL}/api/v3/endpoints`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-key-12345',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('📊 Svix Integration Tests', () => {
    test('should verify Svix application is created for user', async () => {
      console.log('🔍 Testing Svix application creation...');

      // Create a webhook endpoint to trigger Svix app creation
      const endpointData = {
        type: 'webhook' as const,
        name: 'Svix Test Webhook',
        config: {
          url: 'https://webhook.site/svix-test',
          format: 'full' as const,
        },
      };

      const { response, data } = await apiRequest('/endpoints', {
        method: 'POST',
        body: JSON.stringify(endpointData),
      });

      expect(response.status).toBe(201);
      expect(data.svixEndpointId).toBeDefined();
      
      // Add to cleanup list as safety net
      if (data.id) {
        createdEndpointIds.push(data.id);
      }

      // Verify Svix application exists in database
      const svixApps = await db
        .select()
        .from(svixApplications)
        .limit(1);

      expect(svixApps.length).toBeGreaterThan(0);

      // Cleanup immediately and remove from cleanup list
      if (data.id) {
        await apiRequest(`/endpoints/${data.id}`, { method: 'DELETE' });
        createdEndpointIds.splice(createdEndpointIds.indexOf(data.id), 1);
      }
    });
  });
});

