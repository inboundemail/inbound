import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import {
  emailAddresses,
  emailDomains,
  endpoints,
  webhooks,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { AWSSESReceiptRuleManager } from "@/lib/aws-ses/aws-ses-rules";
import { BatchRuleManager } from "@/lib/aws-ses/batch-rule-manager";
import type { NewEmailAddress } from "@/lib/db/schema";

// Request/Response Types (OpenAPI-compatible)
const CreateEmailAddressBody = t.Object({
  address: t.String({ minLength: 1 }),
  domainId: t.String({ minLength: 1 }),
  endpointId: t.Optional(t.String()),
  webhookId: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean({ default: true })),
});

const RoutingSchema = t.Object({
  type: t.Union([
    t.Literal("webhook"),
    t.Literal("endpoint"),
    t.Literal("none"),
  ]),
  id: t.Nullable(t.String()),
  name: t.Nullable(t.String()),
  config: t.Optional(t.Unknown()),
  isActive: t.Boolean(),
});

const DomainRefSchema = t.Object({
  id: t.String(),
  name: t.String(),
  status: t.String(),
});

const CreateEmailAddressResponse = t.Object({
  id: t.String(),
  address: t.String(),
  domainId: t.String(),
  webhookId: t.Nullable(t.String()),
  endpointId: t.Nullable(t.String()),
  isActive: t.Boolean(),
  isReceiptRuleConfigured: t.Boolean(),
  receiptRuleName: t.Nullable(t.String()),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
  userId: t.String(),
  domain: DomainRefSchema,
  routing: RoutingSchema,
  warning: t.Optional(t.String()),
});

const ErrorResponse = t.Object({
  error: t.String(),
  code: t.Optional(t.String()),
  required: t.Optional(t.Array(t.String())),
});

export const createEmailAddress = new Elysia().post(
  "/email-addresses",
  async ({ request, body, set }) => {
    console.log("📝 POST /api/e2/email-addresses - Starting request");

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    console.log("📋 Request data:", {
      address: body.address,
      domainId: body.domainId,
      endpointId: body.endpointId,
      webhookId: body.webhookId,
      isActive: body.isActive,
    });

    // Validate required fields
    if (!body.address || !body.domainId) {
      console.log("❌ Missing required fields");
      set.status = 400;
      return {
        error: "Missing required fields",
        required: ["address", "domainId"],
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.address)) {
      console.log("❌ Invalid email address format:", body.address);
      set.status = 400;
      return { error: "Invalid email address format" };
    }

    // Check if domain exists and belongs to user
    console.log("🔍 Checking domain ownership");
    const domainResult = await db
      .select()
      .from(emailDomains)
      .where(
        and(eq(emailDomains.id, body.domainId), eq(emailDomains.userId, userId))
      )
      .limit(1);

    if (!domainResult[0]) {
      console.log("❌ Domain not found or access denied:", body.domainId);
      set.status = 404;
      return { error: "Domain not found or access denied" };
    }

    // Validate email domain matches domain record
    const emailDomain = body.address.split("@")[1];
    if (emailDomain !== domainResult[0].domain) {
      console.log(
        "❌ Email domain mismatch:",
        emailDomain,
        "vs",
        domainResult[0].domain
      );
      set.status = 400;
      return {
        error: `Email address must belong to domain ${domainResult[0].domain}`,
      };
    }

    // Check if email already exists
    console.log("🔍 Checking if email address already exists");
    const existingEmail = await db
      .select()
      .from(emailAddresses)
      .where(eq(emailAddresses.address, body.address))
      .limit(1);

    if (existingEmail[0]) {
      console.log("❌ Email address already exists:", body.address);
      set.status = 409;
      return { error: "Email address already exists" };
    }

    // Validate endpoint/webhook if provided
    let endpointId: string | null = null;
    let webhookId: string | null = null;
    let routingInfo: {
      type: "webhook" | "endpoint" | "none";
      id: string | null;
      name: string | null;
      config?: any;
      isActive: boolean;
    } | null = null;

    if (body.endpointId) {
      console.log("🔍 Validating endpoint:", body.endpointId);
      const endpointResult = await db
        .select()
        .from(endpoints)
        .where(
          and(eq(endpoints.id, body.endpointId), eq(endpoints.userId, userId))
        )
        .limit(1);

      if (!endpointResult[0]) {
        console.log("❌ Endpoint not found or access denied:", body.endpointId);
        set.status = 404;
        return { error: "Endpoint not found or access denied" };
      }
      endpointId = body.endpointId;
      routingInfo = {
        type: "endpoint",
        id: endpointResult[0].id,
        name: endpointResult[0].name,
        config: JSON.parse(endpointResult[0].config),
        isActive: endpointResult[0].isActive || false,
      };
    } else if (body.webhookId) {
      console.log("🔍 Validating webhook:", body.webhookId);
      const webhookResult = await db
        .select()
        .from(webhooks)
        .where(
          and(eq(webhooks.id, body.webhookId), eq(webhooks.userId, userId))
        )
        .limit(1);

      if (!webhookResult[0]) {
        console.log("❌ Webhook not found or access denied:", body.webhookId);
        set.status = 404;
        return { error: "Webhook not found or access denied" };
      }
      webhookId = body.webhookId;
      routingInfo = {
        type: "webhook",
        id: webhookResult[0].id,
        name: webhookResult[0].name,
        config: { url: webhookResult[0].url },
        isActive: webhookResult[0].isActive || false,
      };
    }

    // Create the email address
    console.log("📝 Creating email address record");
    const newEmailAddress: NewEmailAddress = {
      id: nanoid(),
      address: body.address,
      domainId: body.domainId,
      endpointId,
      webhookId,
      isActive: body.isActive !== undefined ? body.isActive : true,
      isReceiptRuleConfigured: false,
      receiptRuleName: null,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [createdEmailAddress] = await db
      .insert(emailAddresses)
      .values(newEmailAddress)
      .returning();
    console.log("✅ Email address record created:", createdEmailAddress.id);

    // Configure AWS SES receipt rule for the new email
    let isReceiptRuleConfigured = false;
    let receiptRuleName: string | null = null;
    let awsConfigurationWarning: string | undefined;

    try {
      console.log("🔧 Configuring AWS SES receipt rules");

      // Get AWS configuration
      const awsRegion = process.env.AWS_REGION || "us-east-2";
      const lambdaFunctionName =
        process.env.LAMBDA_FUNCTION_NAME || "email-processor";
      const s3BucketName = process.env.S3_BUCKET_NAME;
      const awsAccountId = process.env.AWS_ACCOUNT_ID;

      if (!s3BucketName || !awsAccountId) {
        awsConfigurationWarning =
          "AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID";
        console.warn(`⚠️ ${awsConfigurationWarning}`);
      } else {
        const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
          lambdaFunctionName,
          awsAccountId,
          awsRegion
        );

        // Check if domain already has a batch catch-all rule
        if (
          !domainResult[0].catchAllReceiptRuleName?.startsWith("batch-rule-")
        ) {
          console.log(
            "🔧 Domain not yet in batch catch-all, adding to batch rule"
          );

          const batchManager = new BatchRuleManager(
            "inbound-catchall-domain-default"
          );
          const sesManager = new AWSSESReceiptRuleManager(awsRegion);

          try {
            // Find or create rule with capacity
            const rule = await batchManager.findOrCreateRuleWithCapacity(1);

            // Add domain catch-all to batch rule
            await sesManager.configureBatchCatchAllRule({
              domains: [domainResult[0].domain],
              lambdaFunctionArn: lambdaArn,
              s3BucketName,
              ruleSetName: "inbound-catchall-domain-default",
              ruleName: rule.ruleName,
            });

            // Update domain record
            await db
              .update(emailDomains)
              .set({
                catchAllReceiptRuleName: rule.ruleName,
                updatedAt: new Date(),
              })
              .where(eq(emailDomains.id, domainResult[0].id));

            // Increment rule capacity
            await batchManager.incrementRuleCapacity(rule.id, 1);

            // Update email address record
            await db
              .update(emailAddresses)
              .set({
                isReceiptRuleConfigured: true,
                receiptRuleName: rule.ruleName,
                updatedAt: new Date(),
              })
              .where(eq(emailAddresses.id, createdEmailAddress.id));

            isReceiptRuleConfigured = true;
            receiptRuleName = rule.ruleName;
            console.log(`✅ Added domain to batch rule: ${rule.ruleName}`);
          } catch (error) {
            console.error("Failed to add domain to batch rule:", error);
            awsConfigurationWarning =
              "Failed to configure batch catch-all rule";
          }
        } else {
          receiptRuleName = domainResult[0].catchAllReceiptRuleName;

          // Update email address record (domain already has batch rule)
          await db
            .update(emailAddresses)
            .set({
              isReceiptRuleConfigured: true,
              receiptRuleName: receiptRuleName,
              updatedAt: new Date(),
            })
            .where(eq(emailAddresses.id, createdEmailAddress.id));

          isReceiptRuleConfigured = true;
          console.log(`✅ Domain already in batch rule: ${receiptRuleName}`);
        }
      }
    } catch (error) {
      awsConfigurationWarning = `SES configuration error: ${error instanceof Error ? error.message : "Unknown error"}`;
      console.error("❌ AWS SES configuration failed:", error);
    }

    // Build response
    const response = {
      id: createdEmailAddress.id,
      address: createdEmailAddress.address,
      domainId: createdEmailAddress.domainId,
      webhookId: createdEmailAddress.webhookId,
      endpointId: createdEmailAddress.endpointId,
      isActive: createdEmailAddress.isActive || false,
      isReceiptRuleConfigured,
      receiptRuleName,
      createdAt: (createdEmailAddress.createdAt || new Date()).toISOString(),
      updatedAt: (createdEmailAddress.updatedAt || new Date()).toISOString(),
      userId: createdEmailAddress.userId,
      domain: {
        id: domainResult[0].id,
        name: domainResult[0].domain,
        status: domainResult[0].status,
      },
      routing: routingInfo || {
        type: "none" as const,
        id: null,
        name: null,
        isActive: false,
      },
      ...(awsConfigurationWarning && { warning: awsConfigurationWarning }),
    };

    console.log(
      "✅ POST /api/e2/email-addresses - Successfully created email address"
    );
    set.status = 201;
    return response;
  },
  {
    body: CreateEmailAddressBody,
    response: {
      201: CreateEmailAddressResponse,
      400: ErrorResponse,
      401: ErrorResponse,
      404: ErrorResponse,
      409: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Email Addresses"],
      summary: "Create email address",
      description:
        "Create a new email address for an authenticated user's domain, optionally routing to a webhook or endpoint.",
    },
  }
);
