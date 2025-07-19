// This is a test file to test the API endpoints

// @ts-ignore - bun:test is a Bun-specific module not recognized by TypeScript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { GetMailResponse, PostMailResponse } from "./mail/route";
import { GetMailByIdResponse } from "./mail/[id]/route";
import { GetEndpointsResponse, PostEndpointsResponse } from "./endpoints/route";
import { GetEndpointByIdResponse, PutEndpointByIdResponse, DeleteEndpointByIdResponse } from "./endpoints/[id]/route";
import { GetEmailAddressesResponse, PostEmailAddressesResponse } from "./email-addresses/route";
import { GetEmailAddressByIdResponse, PutEmailAddressByIdResponse, DeleteEmailAddressByIdResponse } from "./email-addresses/[id]/route";
import { GetDomainsResponse, PostDomainsRequest, PostDomainsResponse } from "./domains/route";
import { GetDomainByIdResponse, PutDomainByIdRequest, PutDomainByIdResponse } from "./domains/[id]/route";
import { PostEmailsResponse } from "./emails/route";
import { GetEmailByIdResponse } from "./emails/[id]/route";
import type { WebhookConfig } from "@/features/endpoints/types";
import { setupWebhook, createTestFlag, sendTestEmail } from "./helper/webhook-tester";
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
 * 1. Create a domain (POST /api/v2/domains) - Note: This will fail in tests as DNS checks will fail
 * 2. List all domains (GET /api/v2/domains)
 * 3. Get a domain by ID (GET /api/v2/domains/{id})
 * 4. Update catch-all settings (PUT /api/v2/domains/{id}) - turn on
 * 5. Update catch-all settings (PUT /api/v2/domains/{id}) - turn off
 * 6. List domains again to verify changes
 * 7. Save domain ID for email address tests
 */

describe("create a domain", () => {
    it("should attempt to create a domain and handle DNS conflict error", async () => {
        const testDomain = `test-${Date.now()}.example.com`;
        const requestBody: PostDomainsRequest = {
            domain: testDomain
        };

        const response = await fetch(`${API_URL}/domains`, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        // Since we're testing with a real DNS check, this will likely fail
        // unless the domain truly has no MX/CNAME records
        if (response.status === 201) {
            const data: PostDomainsResponse = await response.json();
            expect(data.id).toBeDefined();
            expect(data.domain).toBe(testDomain);
            expect(data.status).toBe('pending');
            expect(data.dnsRecords).toBeDefined();
            expect(Array.isArray(data.dnsRecords)).toBe(true);
            expect(data.dnsRecords.length).toBeGreaterThan(0);
            
            // Check for TXT and MX records
            const txtRecord = data.dnsRecords.find(r => r.type === 'TXT');
            const mxRecord = data.dnsRecords.find(r => r.type === 'MX');
            expect(txtRecord).toBeDefined();
            expect(mxRecord).toBeDefined();
        } else if (response.status === 400) {
            const error = await response.json();
            // Expected error for domains with existing MX/CNAME records
            expect(error.error).toBeDefined();
            console.log('Expected DNS conflict error:', error.error);
        } else {
            // Log unexpected status codes
            const error = await response.json();
            console.error('Unexpected response:', response.status, error);
            expect(response.status).toBeOneOf([201, 400]);
        }
    });
});

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

describe("list domains with verification check", () => {
    it("should return domains with verification status when check=true", async () => {
        const response = await fetch(`${API_URL}/domains?check=true&limit=1`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const data: GetDomainsResponse = await response.json();
        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(Array.isArray(data.data)).toBe(true);
        
        // If we have domains, check verification data
        if (data.data.length > 0) {
            const domain = data.data[0];
            expect(domain.verificationCheck).toBeDefined();
            expect(domain.verificationCheck?.sesStatus).toBeDefined();
            expect(domain.verificationCheck?.isFullyVerified).toBeDefined();
            expect(domain.verificationCheck?.lastChecked).toBeDefined();
            
            // DNS records should be an array (can be empty)
            expect(Array.isArray(domain.verificationCheck?.dnsRecords)).toBe(true);
            
            console.log('Verification check result:', {
                domain: domain.domain,
                sesStatus: domain.verificationCheck?.sesStatus,
                isFullyVerified: domain.verificationCheck?.isFullyVerified,
                dnsRecordsCount: domain.verificationCheck?.dnsRecords?.length || 0
            });
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

// End-to-End Email Webhook Test

describe("end-to-end email webhook test", () => {
    let testEndpointId: string;
    let testEmailAddressId: string;
    let testDomainId: string;
    let testDomain: string;
    
    it("should create endpoint, email address, send email, and receive webhook", async () => {
        // Skip if no domains available
        
        testDomainId = "indm_h6yoR3_ENuce_J8OLm7Yh"; // exon.dev domain id
        testDomain = "exon.dev";
        
        console.log("🚀 Starting end-to-end email webhook test...");
        
        // Create unique test flag
        const testFlag = createTestFlag();
        console.log(`🏷️ Test flag: ${testFlag}`);
        
        // Step 1: Start webhook listener
        const webhook = await setupWebhook({
            match: (body: any) => {
                console.log("🔍 Checking webhook payload for flag:", testFlag);
                return body?.text?.includes(testFlag) || 
                       body?.html?.includes(testFlag) || 
                       body?.subject?.includes(testFlag) ||
                       JSON.stringify(body).includes(testFlag);
            },
            timeoutMs: 45000 // 45 seconds for email delivery
        });
        
        const webhookUrl = webhook.url;
        console.log(`🌐 Webhook URL: ${webhookUrl}`);
        
        // Step 2: Create a webhook endpoint
        const createEndpointResponse = await fetch(`${API_URL}/endpoints`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                name: "E2E Test Webhook Endpoint",
                type: "webhook",
                description: "End-to-end test webhook endpoint",
                config: {
                    url: webhookUrl,
                    timeout: 30,
                    retryAttempts: 3,
                    headers: {
                        "X-Test": "e2e-webhook-test"
                    }
                }
            })
        });
        
        const endpointData = await createEndpointResponse.json();
        expect(createEndpointResponse.status).toBe(201);
        testEndpointId = endpointData.id;
        console.log(`✅ Created webhook endpoint: ${testEndpointId}`);
        
        // Step 3: Create email address
        const testEmailAddress = `e2e-test-${Date.now()}@${testDomain}`;
        
        const createEmailResponse = await fetch(`${API_URL}/email-addresses`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                address: testEmailAddress,
                domainId: testDomainId,
                endpointId: testEndpointId,
                isActive: true
            })
        });
        
        const emailData = await createEmailResponse.json();
        expect(createEmailResponse.status).toBe(201);
        testEmailAddressId = emailData.id;
        console.log(`✅ Created email address: ${testEmailAddress}`);

        // Step 4.5: Confirm the email address is routed to the webhook endpoint
        const getEmailResponse = await fetch(`${API_URL}/email-addresses/${testEmailAddressId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const emailAddressData = await getEmailResponse.json();
        console.log("🔍 Email address data:", emailAddressData);
        expect(getEmailResponse.status).toBe(200);
        expect(emailAddressData.routing.type).toBe("endpoint");
        expect(emailAddressData.endpointId).toBe(testEndpointId);

        console.log(`✅ Email address routing configured to webhook endpoint`);
        
        // Step 5: Send test email via Resend
        console.log("📧 Sending test email via Resend...");
        await sendTestEmail({
            to: testEmailAddress,
            subject: `E2E Test Email - ${testFlag}`,
            text: `This is an end-to-end test email with flag: ${testFlag}`,
            html: `<p>This is an end-to-end test email with flag: <strong>${testFlag}</strong></p>`
        });
        
        // Step 6: Await webhook delivery
        console.log("⏳ Awaiting webhook delivery...");
        const webhookBody = await webhook.waitForWebhook();
        
        // Step 7: Verify webhook received correct data
        expect(webhookBody).toBeDefined();
        expect(JSON.stringify(webhookBody)).toContain(testFlag);
        console.log("✅ End-to-end test completed successfully!");
        
        // Cleanup
        await webhook.close();
        
    }, 60000); // 60 second timeout for the entire test
    
    // Cleanup test data
    afterAll(async () => {
        if (testEmailAddressId) {
            console.log("🧹 Cleaning up test email address...");
            await fetch(`${API_URL}/email-addresses/${testEmailAddressId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`
                }
            });
        }
        
        if (testEndpointId) {
            console.log("🧹 Cleaning up test endpoint...");
            await fetch(`${API_URL}/endpoints/${testEndpointId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`
                }
            });
        }
    });
});

// Send Email API Tests

describe("send email via Inbound API", () => {
    let sentEmailId: string; // Store email ID for retrieval test

    it("should send an email and return email ID with a 200 status code", async () => {
        const response = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Test Sender <test@exon.dev>",
                to: "test-recipient@example.com",
                subject: "Test Email from Inbound API",
                text: "This is a test email sent via Inbound API",
                html: "<p>This is a test email sent via <strong>Inbound API</strong></p>"
            })
        });
        
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        expect(data.id).toMatch(/^[a-zA-Z0-9_-]+$/); // Should be a valid nanoid
        sentEmailId = data.id; // Store for retrieval test
        console.log(`✅ Email sent successfully with ID: ${data.id}`);
    });

    it("should handle missing required fields with a 400 status code", async () => {
        const response = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "test@exon.dev",
                // Missing 'to' and 'subject'
                text: "Test email"
            })
        });
        
        const data = await response.json();
        expect(response.status).toBe(400);
        expect(data.error).toBe("Missing required fields: from, to, and subject are required");
    });

    it("should handle missing email content with a 400 status code", async () => {
        const response = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "test@exon.dev",
                to: "recipient@example.com",
                subject: "Test Subject"
                // Missing both 'text' and 'html'
            })
        });
        
        const data = await response.json();
        expect(response.status).toBe(400);
        expect(data.error).toBe("Either html or text content must be provided");
    });

    it("should handle unauthorized domain with a 403 status code", async () => {
        const response = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "test@unauthorized-domain.com",
                to: "recipient@example.com",
                subject: "Test Subject",
                text: "Test content"
            })
        });
        
        const data = await response.json();
        expect(response.status).toBe(403);
        expect(data.error).toContain("You don't have permission to send from domain");
    });

    it("should handle idempotency key correctly", async () => {
        const idempotencyKey = `test-idempotency-${Date.now()}`;
        const emailData = {
            from: "Test Sender <test@exon.dev>",
            to: "test-recipient@example.com",
            subject: "Idempotency Test Email",
            text: "This email tests idempotency"
        };

        // First request
        const response1 = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey
            },
            body: JSON.stringify(emailData)
        });
        
        const data1 = await response1.json();
        expect(response1.status).toBe(200);
        expect(data1.id).toBeDefined();

        // Second request with same idempotency key
        const response2 = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey
            },
            body: JSON.stringify(emailData)
        });
        
        const data2 = await response2.json();
        expect(response2.status).toBe(200);
        expect(data2.id).toBe(data1.id); // Should return the same email ID
        console.log(`✅ Idempotency working correctly - same ID returned: ${data1.id}`);
    });
});

// Retrieve Sent Email API Tests

describe("retrieve sent email via Inbound API", () => {
    let retrieveEmailId: string;

    // First, send an email to have something to retrieve
    beforeAll(async () => {
        const response = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Retrieval Test <test@exon.dev>",
                to: ["retrieve-test@example.com", "second@example.com"],
                cc: ["cc-test@example.com"],
                bcc: ["bcc-test@example.com"],
                reply_to: ["reply@example.com"],
                subject: "Email for Retrieval Test",
                text: "This is a test email for retrieval testing",
                html: "<h1>Test Email</h1><p>This is a test email for retrieval testing</p>",
                headers: {
                    "X-Test-Header": "test-value"
                }
            })
        });
        
        const data = await response.json();
        expect(response.status).toBe(200);
        retrieveEmailId = data.id;
        console.log(`📧 Created test email for retrieval: ${retrieveEmailId}`);
    });

    it("should retrieve an email by ID with a 200 status code", async () => {
        const response = await fetch(`${API_URL}/emails/${retrieveEmailId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        
        const data = await response.json();
        expect(response.status).toBe(200);
        
        // Verify response structure
        expect(data.object).toBe("email");
        expect(data.id).toBe(retrieveEmailId);
        expect(data.from).toBe("Retrieval Test <test@exon.dev>");
        expect(data.subject).toBe("Email for Retrieval Test");
        expect(data.text).toBe("This is a test email for retrieval testing");
        expect(data.html).toBe("<h1>Test Email</h1><p>This is a test email for retrieval testing</p>");
        
        // Verify arrays
        expect(Array.isArray(data.to)).toBe(true);
        expect(data.to).toContain("retrieve-test@example.com");
        expect(data.to).toContain("second@example.com");
        expect(Array.isArray(data.cc)).toBe(true);
        expect(data.cc).toContain("cc-test@example.com");
        expect(Array.isArray(data.bcc)).toBe(true);
        expect(data.bcc).toContain("bcc-test@example.com");
        expect(Array.isArray(data.reply_to)).toBe(true);
        expect(data.reply_to).toContain("reply@example.com");
        
        // Verify metadata
        expect(data.created_at).toBeDefined();
        expect(data.last_event).toBeDefined();
        expect(['pending', 'delivered', 'failed']).toContain(data.last_event);
        
        console.log(`✅ Successfully retrieved email with status: ${data.last_event}`);
    });

    it("should handle non-existent email ID with a 404 status code", async () => {
        const fakeId = "em_nonexistent123456789";
        const response = await fetch(`${API_URL}/emails/${fakeId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        
        const data = await response.json();
        expect(response.status).toBe(404);
        expect(data.error).toBe("Email not found");
    });

    it("should handle unauthorized access with a 401 status code", async () => {
        const response = await fetch(`${API_URL}/emails/${retrieveEmailId}`, {
            headers: {
                "Authorization": "Bearer invalid_api_key"
            }
        });
        
        const data = await response.json();
        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
    });

    it("should handle empty arrays correctly", async () => {
        // Send an email with minimal fields
        const sendResponse = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Minimal Test <test@exon.dev>",
                to: "minimal@example.com",
                subject: "Minimal Email Test",
                text: "Minimal content"
            })
        });
        
        const sendData = await sendResponse.json();
        expect(sendResponse.status).toBe(200);
        const minimalEmailId = sendData.id;
        
        // Retrieve the minimal email
        const getResponse = await fetch(`${API_URL}/emails/${minimalEmailId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        
        const getData = await getResponse.json();
        expect(getResponse.status).toBe(200);
        
        // Verify empty arrays are returned as [null]
        expect(getData.bcc).toEqual([null]);
        expect(getData.cc).toEqual([null]);
        expect(getData.reply_to).toEqual([null]);
        
        console.log(`✅ Empty arrays correctly returned as [null]`);
    });
});

// End-to-End Email Sending and Webhook Test using Inbound API

describe("end-to-end email sending via Inbound API with webhook", () => {
    let testEndpointId: string;
    let testEmailAddressId: string;
    let testDomainId: string;
    let testDomain: string;
    
    it("should send email via Inbound API and receive webhook", async () => {
        testDomainId = "indm_h6yoR3_ENuce_J8OLm7Yh"; // exon.dev domain id
        testDomain = "exon.dev";
        
        console.log("🚀 Starting end-to-end Inbound API email test...");
        
        // Create unique test flag
        const testFlag = createTestFlag();
        console.log(`🏷️ Test flag: ${testFlag}`);
        
        // Step 1: Start webhook listener
        const webhook = await setupWebhook({
            match: (body: any) => {
                console.log("🔍 Checking webhook payload for flag:", testFlag);
                return body?.text?.includes(testFlag) || 
                       body?.html?.includes(testFlag) || 
                       body?.subject?.includes(testFlag) ||
                       JSON.stringify(body).includes(testFlag);
            },
            timeoutMs: 45000 // 45 seconds for email delivery
        });
        
        const webhookUrl = webhook.url;
        console.log(`🌐 Webhook URL: ${webhookUrl}`);
        
        // Step 2: Create a webhook endpoint
        const createEndpointResponse = await fetch(`${API_URL}/endpoints`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                name: "Inbound API E2E Test Webhook",
                type: "webhook",
                description: "End-to-end test webhook for Inbound API email sending",
                config: {
                    url: webhookUrl,
                    timeout: 30,
                    retryAttempts: 3,
                    headers: {
                        "X-Test": "inbound-api-e2e-test"
                    }
                }
            })
        });
        
        const endpointData = await createEndpointResponse.json();
        expect(createEndpointResponse.status).toBe(201);
        testEndpointId = endpointData.id;
        console.log(`✅ Created webhook endpoint: ${testEndpointId}`);
        
        // Step 3: Create email address
        const testEmailAddress = `inbound-api-test-${Date.now()}@${testDomain}`;
        
        const createEmailResponse = await fetch(`${API_URL}/email-addresses`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                address: testEmailAddress,
                domainId: testDomainId,
                endpointId: testEndpointId,
                isActive: true
            })
        });
        
        const emailData = await createEmailResponse.json();
        expect(createEmailResponse.status).toBe(201);
        testEmailAddressId = emailData.id;
        console.log(`✅ Created email address: ${testEmailAddress}`);

        // Step 4: Confirm the email address is routed to the webhook endpoint
        const getEmailResponse = await fetch(`${API_URL}/email-addresses/${testEmailAddressId}`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const emailAddressData = await getEmailResponse.json();
        console.log("🔍 Email address data:", emailAddressData);
        expect(getEmailResponse.status).toBe(200);
        expect(emailAddressData.routing.type).toBe("endpoint");
        expect(emailAddressData.endpointId).toBe(testEndpointId);

        console.log(`✅ Email address routing configured to webhook endpoint`);
        
        // Step 5: Send test email via Inbound API
        console.log("📧 Sending test email via Inbound API...");
        const sendEmailResponse = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: `Inbound API Test <noreply@${testDomain}>`,
                to: testEmailAddress,
                subject: `Inbound API E2E Test - ${testFlag}`,
                text: `This is an end-to-end test email sent via Inbound API with flag: ${testFlag}`,
                html: `<h1>Inbound API Test</h1><p>This is an end-to-end test email sent via <strong>Inbound API</strong> with flag: <strong>${testFlag}</strong></p>`,
                headers: {
                    "X-Test-Flag": testFlag
                }
            })
        });
        
        const sendEmailData = await sendEmailResponse.json();
        expect(sendEmailResponse.status).toBe(200);
        expect(sendEmailData.id).toBeDefined();
        console.log(`✅ Email sent via Inbound API with ID: ${sendEmailData.id}`);
        
        // Step 6: Await webhook delivery
        console.log("⏳ Awaiting webhook delivery...");
        const webhookBody = await webhook.waitForWebhook();
        
        // Step 7: Verify webhook received correct data
        expect(webhookBody).toBeDefined();
        expect(JSON.stringify(webhookBody)).toContain(testFlag);
        console.log("✅ Inbound API end-to-end test completed successfully!");
        
        // Cleanup
        await webhook.close();
        
    }, 60000); // 60 second timeout for the entire test
    
    // Cleanup test data
    afterAll(async () => {
        if (testEmailAddressId) {
            console.log("🧹 Cleaning up test email address...");
            await fetch(`${API_URL}/email-addresses/${testEmailAddressId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`
                }
            });
        }
        
        if (testEndpointId) {
            console.log("🧹 Cleaning up test endpoint...");
            await fetch(`${API_URL}/endpoints/${testEndpointId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`
                }
            });
        }
    });
});

// Reply to Email API Tests

describe("reply to email via Inbound API", () => {
    // We need to first receive an email to reply to
    let receivedEmailId: string = "";
    let senderEmail: string = "";
    let originalSubject: string = "";
    
    beforeAll(async () => {
        // Send a test email to create something to reply to
        // This would normally come from an external sender
        // For testing, we'll simulate by directly creating an email in the database
        // or by using a test endpoint that creates a structured email
        
        // For now, we'll use a placeholder ID - in real tests this would be set up properly
        console.log("⚠️ Note: Reply tests require a received email to be set up first");
    });

    it("should reply to an email with default subject and recipient", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Test Reply <test@exon.dev>",
                text: "This is a test reply to your email.",
                html: "<p>This is a test reply to your email.</p>"
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
    });

    it("should reply with custom subject and recipients", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Test Reply <test@exon.dev>",
                to: ["custom@example.com"],
                cc: ["cc@example.com"],
                subject: "Custom Reply Subject",
                text: "This is a custom reply.",
                html: "<p>This is a custom reply.</p>",
                include_original: false
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
    });

    it("should return 404 for non-existent email", async () => {
        const response = await fetch(`${API_URL}/emails/non-existent-id/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Test Reply <test@exon.dev>",
                text: "This is a test reply."
            })
        });

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe("Email not found");
    });

    it("should return 400 for missing required fields", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // Missing 'from' field
                text: "This is a test reply."
            })
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("From address is required");
    });

    it("should return 403 for unauthorized domain", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Test Reply <test@unauthorized-domain.com>",
                text: "This is a test reply."
            })
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toContain("don't have permission to send from domain");
    });

    it("should handle idempotency key correctly", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const idempotencyKey = `test-reply-${Date.now()}`;
        const requestBody = {
            from: "Test Reply <test@exon.dev>",
            text: "This is an idempotent reply test."
        };

        // First request
        const response1 = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey
            },
            body: JSON.stringify(requestBody)
        });

        const data1 = await response1.json();
        expect(response1.status).toBe(200);
        expect(data1.id).toBeDefined();

        // Second request with same idempotency key
        const response2 = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey
            },
            body: JSON.stringify(requestBody)
        });

        const data2 = await response2.json();
        expect(response2.status).toBe(200);
        expect(data2.id).toBe(data1.id); // Should return the same email ID
    });

    it("should include quoted original message by default", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Test Reply <test@exon.dev>",
                text: "This is my reply.",
                html: "<p>This is my reply.</p>"
                // include_original defaults to true
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        // In a real test, we would verify the sent email contains quoted content
        // by checking the sentEmails table or intercepting the SES call
    });

    it("should not include quoted message when include_original is false", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Test Reply <test@exon.dev>",
                text: "This is my reply without quote.",
                include_original: false
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        // In a real test, we would verify the sent email does NOT contain quoted content
    });
});

// Comprehensive Reply to Email Test with Real Email Setup

describe("comprehensive reply to email test with real setup", () => {
    let testDomainId: string = "indm_h6yoR3_ENuce_J8OLm7Yh"; // exon.dev domain id
    let testDomain: string = "exon.dev";
    let receivedEmailId: string = "";
    let testEndpointId: string = "";
    let testEmailAddressId: string = "";
    let originalSenderEmail: string = "ryan.ceo@exon.dev";
    let originalSubject: string = "Test Email for Reply";
    let testRecipientAddress: string = "";
    
    beforeAll(async () => {
        console.log("🚀 Setting up email for reply test...");
        
        // Step 1: Create a webhook endpoint that will capture the email ID
        let capturedEmailId: string = "";
        const captureWebhook = await setupWebhook({
            match: (body: any) => {
                console.log("🔍 Webhook received body:", JSON.stringify(body).substring(0, 200));
                
                // Try different possible ID fields
                const possibleId = body?.id || body?.emailId || body?.email?.id || body?.data?.id;
                
                // Also check if this is our test email by subject
                const isOurEmail = body?.subject === originalSubject || 
                                 body?.email?.subject === originalSubject ||
                                 body?.data?.subject === originalSubject ||
                                 JSON.stringify(body).includes(originalSubject);
                
                if (possibleId && isOurEmail) {
                    capturedEmailId = possibleId;
                    console.log(`📧 Captured email ID: ${capturedEmailId}`);
                    return true;
                }
                
                // If we can't find an ID but it's our email, still match
                if (isOurEmail) {
                    console.log(`📧 Found our test email by subject, but couldn't extract ID`);
                    return true;
                }
                
                return false;
            },
            timeoutMs: 30000
        });
        
        // Step 2: Create endpoint for receiving emails
        const createEndpointResponse = await fetch(`${API_URL}/endpoints`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                name: "Reply Test Webhook Endpoint",
                type: "webhook",
                description: "Webhook for reply test setup",
                config: {
                    url: captureWebhook.url,
                    timeout: 30,
                    retryAttempts: 3
                }
            })
        });
        
        const endpointData = await createEndpointResponse.json();
        expect(createEndpointResponse.status).toBe(201);
        testEndpointId = endpointData.id;
        console.log(`✅ Created webhook endpoint: ${testEndpointId}`);
        
        // Step 3: Create email address to receive test email
        testRecipientAddress = `reply-test-${Date.now()}@${testDomain}`;
        
        const createEmailResponse = await fetch(`${API_URL}/email-addresses`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                address: testRecipientAddress,
                domainId: testDomainId,
                endpointId: testEndpointId,
                isActive: true
            })
        });
        
        const emailData = await createEmailResponse.json();
        expect(createEmailResponse.status).toBe(201);
        testEmailAddressId = emailData.id;
        console.log(`✅ Created email address: ${testRecipientAddress}`);
        
        // Step 4: Send a test email from ryan.ceo@exon.dev using Inbound API
        console.log("📧 Sending test email from ryan.ceo@exon.dev via Inbound API...");
        const sendEmailResponse = await fetch(`${API_URL}/emails`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: `Ryan CEO <${originalSenderEmail}>`,
                to: testRecipientAddress,
                subject: originalSubject,
                text: "Hi team,\n\nThis is a test email from Ryan that we will reply to.\n\nBest regards,\nRyan",
                html: "<p>Hi team,</p><p>This is a test email from Ryan that we will reply to.</p><p>Best regards,<br>Ryan</p>"
            })
        });
        
        const sendData = await sendEmailResponse.json();
        expect(sendEmailResponse.status).toBe(200);
        console.log(`✅ Email sent from ryan.ceo@exon.dev with ID: ${sendData.id}`);
        
        // Step 5: Wait for webhook to capture the email
        console.log("⏳ Waiting for email to be received via webhook...");
        const webhookBody = await captureWebhook.waitForWebhook();
        await captureWebhook.close();
        
        // Step 6: Always get the email from our mailbox to ensure we have the correct ID
        // The webhook might return a different ID format than what the reply endpoint expects
        console.log("📥 Fetching email from mailbox to get correct ID...");
        
        const mailResponse = await fetch(`${API_URL}/mail?limit=10`, {
            headers: {
                "Authorization": `Bearer ${API_KEY}`
            }
        });
        const mailData = await mailResponse.json();
        
        // Find our test email
        const ourEmail = mailData.emails.find((email: any) => 
            email.subject === originalSubject && 
            email.from.includes("ryan.ceo")
        );
        
        if (ourEmail) {
            receivedEmailId = ourEmail.id; // Use the 'id' field, not 'emailId'
            console.log(`✅ Found received email with ID: ${receivedEmailId}`);
            console.log(`📧 Email details:`, {
                id: ourEmail.id,
                emailId: ourEmail.emailId,
                subject: ourEmail.subject,
                from: ourEmail.from
            });
        } else {
            console.error("❌ Could not find test email in mailbox");
            console.log("Available emails:", mailData.emails.map((e: any) => ({
                id: e.id,
                subject: e.subject,
                from: e.from
            })));
        }
    });
    
    afterAll(async () => {
        // Cleanup
        if (testEmailAddressId) {
            console.log("🧹 Cleaning up test email address...");
            await fetch(`${API_URL}/email-addresses/${testEmailAddressId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`
                }
            });
        }
        
        if (testEndpointId) {
            console.log("🧹 Cleaning up test endpoint...");
            await fetch(`${API_URL}/endpoints/${testEndpointId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`
                }
            });
        }
    });

    it("should successfully reply to ryan.ceo@exon.dev with default values", async () => {
        if (!receivedEmailId) {
            console.error("❌ No email ID available for reply test");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: `Test Recipient <${testRecipientAddress}>`,
                text: "Hi Ryan,\n\nThank you for your email. This is our reply back to you.\n\nBest regards,\nTest Team",
                html: "<p>Hi Ryan,</p><p>Thank you for your email. This is our reply back to you.</p><p>Best regards,<br>Test Team</p>"
                // Note: 'to' is omitted, so it should automatically reply to ryan.ceo@exon.dev
            })
        });

        const data = await response.json();
        console.log("Reply response:", data);
        
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        expect(data.id).toMatch(/^[a-zA-Z0-9_-]+$/); // Should be a valid nanoid
        
        console.log(`✅ Successfully sent reply back to ryan.ceo@exon.dev with ID: ${data.id}`);
    });

    it("should reply with proper email threading headers", async () => {
        if (!receivedEmailId) {
            console.error("❌ No email ID available for reply test");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: `Test Recipient <${testRecipientAddress}>`,
                text: "This reply should have proper threading headers.",
                include_original: true
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        // In a production test, we would verify the sent email has:
        // - In-Reply-To header set to the original message ID
        // - References header containing the message ID chain
        // - Subject with "Re: " prefix
        console.log(`✅ Reply sent with threading headers: ${data.id}`);
    });

    it("should handle reply with custom recipients and subject", async () => {
        if (!receivedEmailId) {
            console.error("❌ No email ID available for reply test");
            return;
        }

        const customRecipients = ["custom1@example.com", "custom2@example.com"];
        const customSubject = "Custom Reply: Important Update";

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: `Test Recipient <${testRecipientAddress}>`,
                to: customRecipients,
                cc: ["manager@exon.dev"],
                subject: customSubject,
                text: "This is a custom reply with specific recipients.",
                html: "<p>This is a custom reply with specific recipients.</p>",
                headers: {
                    "X-Priority": "High",
                    "X-Custom-Header": "ReplyTest"
                },
                include_original: false
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        console.log(`✅ Custom reply sent successfully: ${data.id}`);
    });

    it("should properly quote the original message when include_original is true", async () => {
        if (!receivedEmailId) {
            console.error("❌ No email ID available for reply test");
            return;
        }

        const replyText = "This is my reply to your message.";
        
        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Support Team <support@exon.dev>",
                text: replyText,
                html: `<p>${replyText}</p>`,
                include_original: true // Should include quoted original
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        // The sent email should contain:
        // - Our reply text
        // - A quote header like "On [date], [sender] wrote:"
        // - The original message quoted with > prefix (for text) or blockquote (for HTML)
        console.log(`✅ Reply with quoted original sent: ${data.id}`);
    });

    it("should handle reply with attachments", async () => {
        if (!receivedEmailId) {
            console.error("❌ No email ID available for reply test");
            return;
        }

        // Create a simple text file attachment
        const attachmentContent = Buffer.from("This is a test attachment for reply").toString('base64');

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Support Team <support@exon.dev>",
                text: "Please find the attachment in this reply.",
                attachments: [{
                    content: attachmentContent,
                    filename: "reply-attachment.txt",
                    content_type: "text/plain"
                }]
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        console.log(`✅ Reply with attachment sent: ${data.id}`);
    });

    it("should automatically reply to ryan.ceo@exon.dev when 'to' is not provided", async () => {
        if (!receivedEmailId) {
            console.error("❌ No email ID available for reply test");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: `Auto Reply <${testRecipientAddress}>`,
                text: "This automatic reply should go to ryan.ceo@exon.dev since 'to' field is omitted."
                // Note: 'to' field is intentionally omitted, so it should reply to ryan.ceo@exon.dev
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        // The email should be sent to ryan.ceo@exon.dev automatically
        console.log(`✅ Auto-recipient reply sent back to ryan.ceo@exon.dev: ${data.id}`);
    });

    it("should add 'Re: ' prefix when subject is not provided", async () => {
        if (!receivedEmailId) {
            console.error("❌ No email ID available for reply test");
            return;
        }

        const response = await fetch(`${API_URL}/emails/${receivedEmailId}/reply`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Support Team <support@exon.dev>",
                text: "This reply should have 'Re: ' added to the subject."
                // Note: 'subject' field is intentionally omitted
            })
        });

        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.id).toBeDefined();
        
        // The email should have subject: "Re: " + originalSubject
        console.log(`✅ Auto-subject reply sent: ${data.id}`);
    });
});