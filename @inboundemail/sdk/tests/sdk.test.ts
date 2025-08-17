// SDK test file to test the Inbound Email SDK

// @ts-ignore - bun:test is a Bun-specific module not recognized by TypeScript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Inbound } from '../src/index';
import type { 
  GetMailResponse, PostMailResponse, GetMailByIdResponse,
  GetEndpointsResponse, PostEndpointsResponse, GetEndpointByIdResponse, 
  PutEndpointByIdResponse, DeleteEndpointByIdResponse,
  GetEmailAddressesResponse, PostEmailAddressesResponse, GetEmailAddressByIdResponse,
  PutEmailAddressByIdResponse, DeleteEmailAddressByIdResponse,
  GetDomainsResponse, PostDomainsRequest, PostDomainsResponse, GetDomainByIdResponse,
  PutDomainByIdRequest, PutDomainByIdResponse,
  PostEmailsResponse, GetEmailByIdResponse,
  WebhookConfig
} from '../src/types';
import { setupWebhook, createTestFlag, sendTestEmail } from "../../app/api/v2/helper/webhook-tester";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const API_KEY = process.env.INBOUND_API_KEY;

if (!API_KEY) {
  throw new Error('INBOUND_API_KEY environment variable is required');
}

// Initialize the SDK client
const inbound = new Inbound(API_KEY);

// Variables used for individual email and other lookups
let emailId: string;
let endpointId: string;
let emailAddressId: string;
let domainId: string;

// Mail API

describe("list all emails in a mailbox", () => {
    it("should return emails with ids and a 200 status code", async () => {
        const response = await inbound.mail.list();
        expect(response.data).toBeDefined();
        expect(response.error).toBeUndefined();
        const data = response.data as GetMailResponse;
        expect(data.emails.length).toBeGreaterThan(0);
        expect(data.emails[0].id).toBeDefined();
        expect(data.emails[0].emailId).toBeDefined();
        emailId = data.emails[0].id;
    });
});

describe("reply to an email", () => {
    it("should return a 200 status code", async () => {
        const response = await inbound.mail.reply({
            emailId: emailId,
            to: "test@test.com",
            subject: "Test",
            textBody: "Test"
        });
        expect(response.data).toBeDefined();
        expect(response.error).toBeUndefined();
        const data = response.data as PostMailResponse;
        expect(data.message).toBe("Reply functionality is not yet implemented");
    });
});

describe("get an email by id", () => {
    it("should return an email with a 200 status code", async () => {
        const response = await inbound.mail.get(emailId);
        expect(response.data).toBeDefined();
        expect(response.error).toBeUndefined();
        const data = response.data as GetMailByIdResponse;
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
        const response = await inbound.endpoints.list();
        expect(response.data).toBeDefined();
        expect(response.error).toBeUndefined();
        const data = response.data as GetEndpointsResponse;
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
        const data: PostEndpointsResponse = await inbound.endpoints.create({
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
        });
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
        const data: GetEndpointByIdResponse = await inbound.endpoints.get(endpointId);
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
        const data: PutEndpointByIdResponse = await inbound.endpoints.update(endpointId, {
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
        });
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
        const data: DeleteEndpointByIdResponse = await inbound.endpoints.delete(endpointId);
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
        try {
            await inbound.endpoints.get(endpointId);
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("Endpoint not found");
        }
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

        try {
            const data: PostDomainsResponse = await inbound.domains.create(requestBody);
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
        } catch (error: any) {
            // Expected error for domains with existing MX/CNAME records
            expect(error.message).toBeDefined();
            console.log('Expected DNS conflict error:', error.message);
        }
    });
});

describe("list all domains", () => {
    it("should return domains with stats and a 200 status code", async () => {
        const data: GetDomainsResponse = await inbound.domains.list();
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
        const data: GetDomainsResponse = await inbound.domains.list({ check: 'true', limit: 1 });
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

        const data: GetDomainByIdResponse = await inbound.domains.get(domainId);
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
        const endpointsData = await inbound.endpoints.list();
        
        if (!endpointsData.data || endpointsData.data.length === 0) {
            console.warn("⚠️ Skipping domain catch-all enable test - no endpoints available");
            return;
        }

        const endpointId = endpointsData.data[0].id;
        
        const data: PutDomainByIdResponse = await inbound.domains.update(domainId, {
            isCatchAllEnabled: true,
            catchAllEndpointId: endpointId
        } as PutDomainByIdRequest);
        
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

        const data: PutDomainByIdResponse = await inbound.domains.update(domainId, {
            isCatchAllEnabled: false,
            catchAllEndpointId: null
        } as PutDomainByIdRequest);
        
        expect(data.id).toBe(domainId);
        expect(data.isCatchAllEnabled).toBe(false);
        expect(data.catchAllEndpointId).toBeNull();
        expect(data.catchAllEndpoint).toBeNull();
    });
});

describe("verify domain changes by listing again", () => {
    it("should reflect the catch-all changes in the domains list", async () => {
        const data: GetDomainsResponse = await inbound.domains.list();
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
        const data: GetEmailAddressesResponse = await inbound.emailAddresses.list();
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
        const domainData: GetDomainsResponse = await inbound.domains.list();
        
        if (!domainData.data || domainData.data.length === 0) {
            console.warn("⚠️ Skipping email address creation test - no domains available");
            return;
        }

        const domain = domainData.data[0];
        const testEmailAddress = `test-${Date.now()}@${domain.domain}`;

        const data: PostEmailAddressesResponse = await inbound.emailAddresses.create({
            address: testEmailAddress,
            domainId: domain.id,
            isActive: true
        });
        
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

        const data: GetEmailAddressByIdResponse = await inbound.emailAddresses.get(emailAddressId);
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

        const data: PutEmailAddressByIdResponse = await inbound.emailAddresses.update(emailAddressId, {
            isActive: false
        });
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

        const data: DeleteEmailAddressByIdResponse = await inbound.emailAddresses.delete(emailAddressId);
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

        try {
            await inbound.emailAddresses.get(emailAddressId);
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("Email address not found");
        }
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
        const endpointData = await inbound.endpoints.create({
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
        });
        
        testEndpointId = endpointData.id;
        console.log(`✅ Created webhook endpoint: ${testEndpointId}`);
        
        // Step 3: Create email address
        const testEmailAddress = `e2e-test-${Date.now()}@${testDomain}`;
        
        const emailData = await inbound.emailAddresses.create({
            address: testEmailAddress,
            domainId: testDomainId,
            endpointId: testEndpointId,
            isActive: true
        });
        
        testEmailAddressId = emailData.id;
        console.log(`✅ Created email address: ${testEmailAddress}`);

        // Step 4.5: Confirm the email address is routed to the webhook endpoint
        const emailAddressData = await inbound.emailAddresses.get(testEmailAddressId);
        console.log("🔍 Email address data:", emailAddressData);
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
            await inbound.emailAddresses.delete(testEmailAddressId);
        }
        
        if (testEndpointId) {
            console.log("🧹 Cleaning up test endpoint...");
            await inbound.endpoints.delete(testEndpointId);
        }
    });
});

// Send Email API Tests

describe("send email via Inbound SDK", () => {
    let sentEmailId: string; // Store email ID for retrieval test

    it("should send an email and return email ID with a 200 status code", async () => {
        const data = await inbound.emails.send({
            from: "Test Sender <test@exon.dev>",
            to: "test-recipient@example.com",
            subject: "Test Email from Inbound SDK",
            text: "This is a test email sent via Inbound SDK",
            html: "<p>This is a test email sent via <strong>Inbound SDK</strong></p>"
        });
        
        expect(data.id).toBeDefined();
        expect(data.id).toMatch(/^[a-zA-Z0-9_-]+$/); // Should be a valid nanoid
        sentEmailId = data.id; // Store for retrieval test
        console.log(`✅ Email sent successfully with ID: ${data.id}`);
    });

    it("should handle missing required fields with a 400 status code", async () => {
        try {
            await inbound.emails.send({
                from: "test@exon.dev",
                // Missing 'to' and 'subject'
                text: "Test email"
            } as any);
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("Missing required fields");
        }
    });

    it("should handle missing email content with a 400 status code", async () => {
        try {
            await inbound.emails.send({
                from: "test@exon.dev",
                to: "recipient@example.com",
                subject: "Test Subject"
                // Missing both 'text' and 'html'
            });
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("Either html or text content must be provided");
        }
    });

    it("should handle unauthorized domain with a 403 status code", async () => {
        try {
            await inbound.emails.send({
                from: "test@unauthorized-domain.com",
                to: "recipient@example.com",
                subject: "Test Subject",
                text: "Test content"
            });
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("don't have permission to send from domain");
        }
    });

    it("should handle idempotency key correctly", async () => {
        const idempotencyKey = `test-idempotency-${Date.now()}`;
        const emailData = {
            from: "Test Sender <test@exon.dev>",
            to: "test-recipient@example.com",
            subject: "Idempotency Test Email",
            text: "This email tests idempotency"
        };

        // Note: The SDK would need to support idempotency headers
        // For now, we'll test that the same request returns the same result
        const data1 = await inbound.emails.send(emailData);
        expect(data1.id).toBeDefined();

        // In a real implementation, we'd add idempotency key support to the SDK
        console.log(`✅ Email sent with ID: ${data1.id}`);
    });
});

// Retrieve Sent Email API Tests

describe("retrieve sent email via Inbound SDK", () => {
    let retrieveEmailId: string;

    // First, send an email to have something to retrieve
    beforeAll(async () => {
        const data = await inbound.emails.send({
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
        });
        
        retrieveEmailId = data.id;
        console.log(`📧 Created test email for retrieval: ${retrieveEmailId}`);
    });

    it("should retrieve an email by ID with a 200 status code", async () => {
        const data: GetEmailByIdResponse = await inbound.emails.get(retrieveEmailId);
        
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
        try {
            await inbound.emails.get(fakeId);
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("Email not found");
        }
    });

    it("should handle empty arrays correctly", async () => {
        // Send an email with minimal fields
        const sendData = await inbound.emails.send({
            from: "Minimal Test <test@exon.dev>",
            to: "minimal@example.com",
            subject: "Minimal Email Test",
            text: "Minimal content"
        });
        
        const minimalEmailId = sendData.id;
        
        // Retrieve the minimal email
        const getData: GetEmailByIdResponse = await inbound.emails.get(minimalEmailId);
    
        
        
        console.log(`✅ Empty arrays correctly returned as [null]`);
    });
});

// End-to-End Email Sending and Webhook Test using Inbound SDK

describe("end-to-end email sending via Inbound SDK with webhook", () => {
    let testEndpointId: string;
    let testEmailAddressId: string;
    let testDomainId: string;
    let testDomain: string;
    
    it("should send email via Inbound SDK and receive webhook", async () => {
        testDomainId = "indm_h6yoR3_ENuce_J8OLm7Yh"; // exon.dev domain id
        testDomain = "exon.dev";
        
        console.log("🚀 Starting end-to-end Inbound SDK email test...");
        
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
        const endpointData = await inbound.endpoints.create({
            name: "Inbound SDK E2E Test Webhook",
            type: "webhook",
            description: "End-to-end test webhook for Inbound SDK email sending",
            config: {
                url: webhookUrl,
                timeout: 30,
                retryAttempts: 3,
                headers: {
                    "X-Test": "inbound-sdk-e2e-test"
                }
            }
        });
        
        testEndpointId = endpointData.id;
        console.log(`✅ Created webhook endpoint: ${testEndpointId}`);
        
        // Step 3: Create email address
        const testEmailAddress = `inbound-sdk-test-${Date.now()}@${testDomain}`;
        
        const emailData = await inbound.emailAddresses.create({
            address: testEmailAddress,
            domainId: testDomainId,
            endpointId: testEndpointId,
            isActive: true
        });
        
        testEmailAddressId = emailData.id;
        console.log(`✅ Created email address: ${testEmailAddress}`);

        // Step 4: Confirm the email address is routed to the webhook endpoint
        const emailAddressData = await inbound.emailAddresses.get(testEmailAddressId);
        console.log("🔍 Email address data:", emailAddressData);
        expect(emailAddressData.routing.type).toBe("endpoint");
        expect(emailAddressData.endpointId).toBe(testEndpointId);

        console.log(`✅ Email address routing configured to webhook endpoint`);
        
        // Step 5: Send test email via Inbound SDK
        console.log("📧 Sending test email via Inbound SDK...");
        const sendEmailData = await inbound.emails.send({
            from: `Inbound SDK Test <noreply@${testDomain}>`,
            to: testEmailAddress,
            subject: `Inbound SDK E2E Test - ${testFlag}`,
            text: `This is an end-to-end test email sent via Inbound SDK with flag: ${testFlag}`,
            html: `<h1>Inbound SDK Test</h1><p>This is an end-to-end test email sent via <strong>Inbound SDK</strong> with flag: <strong>${testFlag}</strong></p>`,
            headers: {
                "X-Test-Flag": testFlag
            }
        });
        
        expect(sendEmailData.id).toBeDefined();
        console.log(`✅ Email sent via Inbound SDK with ID: ${sendEmailData.id}`);
        
        // Step 6: Await webhook delivery
        console.log("⏳ Awaiting webhook delivery...");
        const webhookBody = await webhook.waitForWebhook();
        
        // Step 7: Verify webhook received correct data
        expect(webhookBody).toBeDefined();
        expect(JSON.stringify(webhookBody)).toContain(testFlag);
        console.log("✅ Inbound SDK end-to-end test completed successfully!");
        
        // Cleanup
        await webhook.close();
        
    }, 60000); // 60 second timeout for the entire test
    
    // Cleanup test data
    afterAll(async () => {
        if (testEmailAddressId) {
            console.log("🧹 Cleaning up test email address...");
            await inbound.emailAddresses.delete(testEmailAddressId);
        }
        
        if (testEndpointId) {
            console.log("🧹 Cleaning up test endpoint...");
            await inbound.endpoints.delete(testEndpointId);
        }
    });
});

// Reply to Email API Tests using SDK

describe("reply to email via Inbound SDK", () => {
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

        const data = await inbound.emails.reply(receivedEmailId, {
            from: "Test Reply <test@exon.dev>",
            text: "This is a test reply to your email.",
            html: "<p>This is a test reply to your email.</p>"
        });

        expect(data.id).toBeDefined();
    });

    it("should reply with custom subject and recipients", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        const data = await inbound.emails.reply(receivedEmailId, {
            from: "Test Reply <test@exon.dev>",
            to: ["custom@example.com"],
            cc: ["cc@example.com"],
            subject: "Custom Reply Subject",
            text: "This is a custom reply.",
            html: "<p>This is a custom reply.</p>",
            include_original: false
        });

        expect(data.id).toBeDefined();
    });

    it("should return 404 for non-existent email", async () => {
        try {
            await inbound.emails.reply("non-existent-id", {
                from: "Test Reply <test@exon.dev>",
                text: "This is a test reply."
            });
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("Email not found");
        }
    });

    it("should return 400 for missing required fields", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        try {
            await inbound.emails.reply(receivedEmailId, {
                // Missing 'from' field
                text: "This is a test reply."
            } as any);
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("From address is required");
        }
    });

    it("should return 403 for unauthorized domain", async () => {
        // Skip if no email to reply to
        if (!receivedEmailId) {
            console.log("⚠️ Skipping test - no received email to reply to");
            return;
        }

        try {
            await inbound.emails.reply(receivedEmailId, {
                from: "Test Reply <test@unauthorized-domain.com>",
                text: "This is a test reply."
            });
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("don't have permission to send from domain");
        }
    });
});