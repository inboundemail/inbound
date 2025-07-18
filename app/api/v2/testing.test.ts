// This is a test file to test the API endpoints

// @ts-ignore - bun:test is a Bun-specific module not recognized by TypeScript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { GetMailResponse, PostMailResponse } from "./mail/route";
import { GetMailByIdResponse } from "./mail/[id]/route";
import { GetEndpointsResponse, PostEndpointsResponse } from "./endpoints/route";
import { GetEndpointByIdResponse, PutEndpointByIdResponse, DeleteEndpointByIdResponse } from "./endpoints/[id]/route";
import { GetEmailAddressesResponse, PostEmailAddressesResponse } from "./email-addresses/route";
import { GetEmailAddressByIdResponse, PutEmailAddressByIdResponse, DeleteEmailAddressByIdResponse } from "./email-addresses/[id]/route";
import { GetDomainsResponse } from "./domains/route";
import { GetDomainByIdResponse, PutDomainByIdRequest, PutDomainByIdResponse } from "./domains/[id]/route";
import type { WebhookConfig } from "@/features/endpoints/types";
import dotenv from "dotenv";

dotenv.config();

const API_URL = "http://localhost:3000/api/v2";
const API_KEY = process.env.INBOUND_API_KEY;

// Variables used for individual email and other lookups

let emailId: string;
let endpointId: string;
let emailAddressId: string;
let domainId: string;

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

// Domains API

/**
 * This is going to:
 * 1. List all domains (GET /api/v2/domains)
 * 2. Get a domain by ID (GET /api/v2/domains/{id})
 * 3. Update catch-all settings (PUT /api/v2/domains/{id}) - turn on
 * 4. Update catch-all settings (PUT /api/v2/domains/{id}) - turn off
 * 5. List domains again to verify changes
 * 6. Save domain ID for email address tests
 */

describe("list all domains", () => {
    it("should return domains with stats and a 200 status code", async () => {
        const response = await fetch(`${API_URL}/domains`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetDomainsResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.pagination).toBeDefined();
        expect(data.pagination.limit).toBeDefined();
        expect(data.pagination.offset).toBeDefined();
        expect(data.pagination.total).toBeDefined();
        expect(data.meta).toBeDefined();
        expect(data.meta.totalCount).toBeDefined();
        expect(data.meta.verifiedCount).toBeDefined();
        expect(data.meta.statusBreakdown).toBeDefined();
        
        // Save domain ID for email tests
        if (data.data.length > 0) {
            domainId = data.data[0].id;
        }
    });
});

describe("get a domain by id", () => {
    it("should return domain details with stats and a 200 status code", async () => {
        if (!domainId) {
            console.warn("⚠️ Skipping domain get test - no domain ID available");
            return;
        }

        const response = await fetch(`${API_URL}/domains/${domainId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetDomainByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(domainId);
        expect(data.domain).toBeDefined();
        expect(data.status).toBeDefined();
        expect(data.canReceiveEmails).toBeDefined();
        expect(data.isCatchAllEnabled).toBeDefined();
        expect(data.stats).toBeDefined();
        expect(data.stats.totalEmailAddresses).toBeDefined();
        expect(data.stats.activeEmailAddresses).toBeDefined();
    });
});

describe("update domain catch-all settings - enable", () => {
    it("should enable catch-all for the domain and return a 200 status code", async () => {
        if (!domainId) {
            console.warn("⚠️ Skipping domain catch-all enable test - no domain ID available");
            return;
        }

        // First, get an endpoint to use for catch-all
        const endpointsResponse = await fetch(`${API_URL}/endpoints`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const endpointsData = await endpointsResponse.json();
        
        if (!endpointsData.data || endpointsData.data.length === 0) {
            console.warn("⚠️ Skipping domain catch-all enable test - no endpoints available");
            return;
        }

        const endpointId = endpointsData.data[0].id;
        
        const response = await fetch(`${API_URL}/domains/${domainId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "PUT",
            body: JSON.stringify({
                isCatchAllEnabled: true,
                catchAllEndpointId: endpointId
            } as PutDomainByIdRequest)
        });
        
        const data: PutDomainByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(domainId);
        expect(data.isCatchAllEnabled).toBe(true);
        expect(data.catchAllEndpointId).toBe(endpointId);
        expect(data.catchAllEndpoint).toBeDefined();
        expect(data.catchAllEndpoint?.id).toBe(endpointId);
    });
});

describe("update domain catch-all settings - disable", () => {
    it("should disable catch-all for the domain and return a 200 status code", async () => {
        if (!domainId) {
            console.warn("⚠️ Skipping domain catch-all disable test - no domain ID available");
            return;
        }

        const response = await fetch(`${API_URL}/domains/${domainId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "PUT",
            body: JSON.stringify({
                isCatchAllEnabled: false,
                catchAllEndpointId: null
            } as PutDomainByIdRequest)
        });
        
        const data: PutDomainByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(domainId);
        expect(data.isCatchAllEnabled).toBe(false);
        expect(data.catchAllEndpointId).toBeNull();
        expect(data.catchAllEndpoint).toBeNull();
    });
});

describe("verify domain changes by listing again", () => {
    it("should reflect the catch-all changes in the domains list", async () => {
        const response = await fetch(`${API_URL}/domains`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetDomainsResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        
        // Find our domain and verify catch-all is disabled
        const ourDomain = data.data.find(d => d.id === domainId);
        expect(ourDomain).toBeDefined();
        expect(ourDomain?.isCatchAllEnabled).toBe(false);
        expect(ourDomain?.catchAllEndpointId).toBeNull();
    });
});

// Email Addresses API

/**
 * This is going to:
 * 1. List all email addresses (GET /api/v2/email-addresses)
 * 2. Create an email address (POST /api/v2/email-addresses) -> (id)
 * 3. Get an email address by (id) (GET /api/v2/email-addresses/{id})
 * 4. Update that email address (PUT /api/v2/email-addresses/{id})
 * 5. Delete that email address (DELETE /api/v2/email-addresses/{id})
 * 6. Verify the email address is deleted (GET /api/v2/email-addresses/{id})
 */

describe("list all email addresses", () => {
    it("should return email addresses with pagination and a 200 status code", async () => {
        const response = await fetch(`${API_URL}/email-addresses`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetEmailAddressesResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.pagination).toBeDefined();
        expect(data.pagination.limit).toBeDefined();
        expect(data.pagination.offset).toBeDefined();
        expect(data.pagination.total).toBeDefined();
        
        // Store domainId for creating email address if we have existing email addresses
        if (data.data.length > 0) {
            domainId = data.data[0].domainId;
        }
    });
});

describe("create an email address", () => {
    it("should create an email address and return a 201 status code", async () => {
        // Skip test if we don't have a domainId
        if (!domainId) {
            console.warn("⚠️ Skipping email address creation test - no domains found");
            return;
        }

        // First, get domain info to create valid email address
        const domainResponse = await fetch(`${API_URL}/domains`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        
        if (!domainResponse.ok) {
            console.warn("⚠️ Skipping email address creation test - could not fetch domains");
            return;
        }

        const domainData: GetDomainsResponse = await domainResponse.json();
        if (!domainData.data || domainData.data.length === 0) {
            console.warn("⚠️ Skipping email address creation test - no domains available");
            return;
        }

        const domain = domainData.data[0];
        const testEmailAddress = `test-${Date.now()}@${domain.domain}`;

        const response = await fetch(`${API_URL}/email-addresses`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                address: testEmailAddress,
                domainId: domain.id,
                isActive: true
            })
        });
        
        const data: PostEmailAddressesResponse = await response.json();
        expect(response.status).toBe(201);
        expect(data.id).toBeDefined();
        expect(data.address).toBe(testEmailAddress);
        expect(data.domainId).toBe(domain.id);
        expect(data.isActive).toBe(true);
        expect(data.domain).toBeDefined();
        expect(data.domain.name).toBe(domain.domain);
        expect(data.routing).toBeDefined();
        expect(data.routing.type).toBe("none");
        emailAddressId = data.id;
    });
});

describe("get an email address by id", () => {
    it("should return email address details and a 200 status code", async () => {
        if (!emailAddressId) {
            console.warn("⚠️ Skipping email address get test - no email address created");
            return;
        }

        const response = await fetch(`${API_URL}/email-addresses/${emailAddressId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetEmailAddressByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(emailAddressId);
        expect(data.address).toBeDefined();
        expect(data.domain).toBeDefined();
        expect(data.domain.name).toBeDefined();
        expect(data.routing).toBeDefined();
        expect(data.isActive).toBe(true);
        expect(data.isReceiptRuleConfigured).toBeDefined();
    });
});

describe("update an email address", () => {
    it("should update the email address and return a 200 status code", async () => {
        if (!emailAddressId) {
            console.warn("⚠️ Skipping email address update test - no email address created");
            return;
        }

        const response = await fetch(`${API_URL}/email-addresses/${emailAddressId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "PUT",
            body: JSON.stringify({
                isActive: false
            })
        });
        const data: PutEmailAddressByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBe(emailAddressId);
        expect(data.isActive).toBe(false);
        expect(data.domain).toBeDefined();
        expect(data.routing).toBeDefined();
    });
});

describe("delete an email address", () => {
    it("should delete the email address and return cleanup info with a 200 status code", async () => {
        if (!emailAddressId) {
            console.warn("⚠️ Skipping email address delete test - no email address created");
            return;
        }

        const response = await fetch(`${API_URL}/email-addresses/${emailAddressId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            },
            method: "DELETE"
        });
        const data: DeleteEmailAddressByIdResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.message).toBe("Email address deleted successfully");
        expect(data.cleanup).toBeDefined();
        expect(data.cleanup.emailAddress).toBeDefined();
        expect(data.cleanup.domain).toBeDefined();
        expect(data.cleanup.sesRuleUpdated).toBeDefined();
    });
});

describe("verify email address deletion", () => {
    it("should not find the deleted email address when getting by id", async () => {
        if (!emailAddressId) {
            console.warn("⚠️ Skipping email address deletion verification test - no email address created");
            return;
        }

        const response = await fetch(`${API_URL}/email-addresses/${emailAddressId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe("Email address not found");
    });
});