// This is a test file to test the API endpoints

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { GetMailResponse, PostMailResponse } from "./mail/route";
import { GetMailByIdResponse } from "./mail/[id]/route";
import { GetEndpointsResponse, PostEndpointsResponse } from "./endpoints/route";
import { GetEndpointByIdResponse, PutEndpointByIdResponse, DeleteEndpointByIdResponse } from "./endpoints/[id]/route";
import type { WebhookConfig } from "@/features/endpoints/types";
import dotenv from "dotenv";

dotenv.config();

const API_URL = "http://localhost:3000/api/v2";
const API_KEY = process.env.INBOUND_API_KEY;

// Variables used for individual email and other lookups

let emailId: string;
let endpointId: string;

// Mail API

describe("list all emails in a mailbox", () => {
    it("should return emails with ids and a 200 status code", async () => {
        const response = await fetch(`${API_URL}/mail`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetMailResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.emails.length).toBeGreaterThan(0);
        expect(data.emails[0].id).toBeDefined();
        expect(data.emails[0].emailId).toBeDefined();
        emailId = data.emails[0].id;
    });
});

describe("reply to an email", () => {
    it("should return a 200 status code", async () => {
        const response = await fetch(`${API_URL}/mail`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            },
            method: "POST",
            body: JSON.stringify({
                emailId: emailId,
                to: "test@test.com",
                subject: "Test",
                textBody: "Test"
            })
        });
        const data: PostMailResponse = await response.json();
        expect(response.status).toBe(201);
        expect(data.message).toBe("Reply functionality is not yet implemented");
    });
});

describe("get an email by id", () => {
    it("should return an email with a 200 status code", async () => {
        const response = await fetch(`${API_URL}/mail/${emailId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetMailByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(emailId);
    });
});

// Endpoints API 

/** 
 * This is going to:
 * 1. List all endpoints (GET /api/v2/endpoints)
 * 2. Create an endpoint (POST /api/v2/endpoints) -> (id)
 * 3. Get an endpoint by (id) (GET /api/v2/endpoints/{id})
 * 4. Update that endpoint (PUT /api/v2/endpoints/{id})
 * 5. Delete that endpoint (DELETE /api/v2/endpoints/{id})
 * 6. List the endpoint again to make sure it's gone (GET /api/v2/endpoints)
 * 
 */

describe("list all endpoints", () => {
    it("should return endpoints with pagination and a 200 status code", async () => {
        const response = await fetch(`${API_URL}/endpoints`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetEndpointsResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.pagination).toBeDefined();
        expect(data.pagination.limit).toBeDefined();
        expect(data.pagination.offset).toBeDefined();
        expect(data.pagination.total).toBeDefined();
    });
});

describe("create an endpoint", () => {
    it("should create a webhook endpoint and return a 201 status code", async () => {
        const response = await fetch(`${API_URL}/endpoints`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                name: "Test Webhook Endpoint",
                type: "webhook",
                description: "Test webhook endpoint for API testing",
                config: {
                    url: "https://webhook.site/test-endpoint",
                    timeout: 30,
                    retryAttempts: 3,
                    headers: {
                        "X-Test": "true"
                    }
                }
            })
        });
        const data: PostEndpointsResponse = await response.json();
        expect(response.status).toBe(201);
        expect(data.id).toBeDefined();
        expect(data.name).toBe("Test Webhook Endpoint");
        expect(data.type).toBe("webhook");
        expect((data.config as WebhookConfig).url).toBe("https://webhook.site/test-endpoint");
        expect(data.isActive).toBe(true);
        endpointId = data.id;
    });
});

describe("get an endpoint by id", () => {
    it("should return endpoint details with stats and a 200 status code", async () => {
        const response = await fetch(`${API_URL}/endpoints/${endpointId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetEndpointByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(endpointId);
        expect(data.name).toBe("Test Webhook Endpoint");
        expect(data.type).toBe("webhook");
        expect((data.config as WebhookConfig).url).toBe("https://webhook.site/test-endpoint");
        expect(data.deliveryStats).toBeDefined();
        expect(data.deliveryStats.total).toBeDefined();
        expect(data.deliveryStats.successful).toBeDefined();
        expect(data.deliveryStats.failed).toBeDefined();
        expect(data.recentDeliveries).toBeDefined();
        expect(Array.isArray(data.recentDeliveries)).toBe(true);
        expect(data.associatedEmails).toBeDefined();
        expect(Array.isArray(data.associatedEmails)).toBe(true);
        expect(data.catchAllDomains).toBeDefined();
        expect(Array.isArray(data.catchAllDomains)).toBe(true);
    });
});

describe("update an endpoint", () => {
    it("should update the endpoint and return a 200 status code", async () => {
        const response = await fetch(`${API_URL}/endpoints/${endpointId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "PUT",
            body: JSON.stringify({
                name: "Updated Test Webhook Endpoint",
                description: "Updated description for testing",
                isActive: false,
                config: {
                    url: "https://webhook.site/updated-endpoint",
                    timeout: 60,
                    retryAttempts: 5,
                    headers: {
                        "X-Test": "updated",
                        "X-Version": "v2"
                    }
                }
            })
        });
        const data: PutEndpointByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(endpointId);
        expect(data.name).toBe("Updated Test Webhook Endpoint");
        expect(data.description).toBe("Updated description for testing");
        expect(data.isActive).toBe(false);
        expect((data.config as WebhookConfig).url).toBe("https://webhook.site/updated-endpoint");
        expect((data.config as WebhookConfig).timeout).toBe(60);
        expect((data.config as WebhookConfig).retryAttempts).toBe(5);
    });
});

describe("delete an endpoint", () => {
    it("should delete the endpoint and return cleanup info with a 200 status code", async () => {
        const response = await fetch(`${API_URL}/endpoints/${endpointId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            },
            method: "DELETE"
        });
        const data: DeleteEndpointByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.message).toBe("Endpoint deleted successfully");
        expect(data.cleanup).toBeDefined();
        expect(data.cleanup.emailAddressesUpdated).toBeDefined();
        expect(data.cleanup.domainsUpdated).toBeDefined();
        expect(data.cleanup.groupEmailsDeleted).toBeDefined();
        expect(data.cleanup.deliveriesDeleted).toBeDefined();
        expect(Array.isArray(data.cleanup.emailAddresses)).toBe(true);
        expect(Array.isArray(data.cleanup.domains)).toBe(true);
    });
});

describe("verify endpoint deletion", () => {
    it("should not find the deleted endpoint when getting by id", async () => {
        const response = await fetch(`${API_URL}/endpoints/${endpointId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe("Endpoint not found");
    });
});