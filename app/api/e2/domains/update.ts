import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import { emailDomains, endpoints } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AWSSESReceiptRuleManager } from "@/lib/aws-ses/aws-ses-rules";
import { BatchRuleManager } from "@/lib/aws-ses/batch-rule-manager";
import { findSubdomainsOwnedByOthers } from "@/lib/db/domains";
import {
  getWildcardMxRecord,
  isRootDomain,
} from "@/lib/domains-and-dns/domain-utils";
import { isManagedDomainName } from "@/lib/domains-and-dns/managed-domain";

const SES_RULE_SET_NAME = "inbound-catchall-domain-default";

// Request/Response Types (OpenAPI-compatible)
const UpdateDomainBody = t.Object({
  isCatchAllEnabled: t.Optional(t.Boolean()),
  catchAllEndpointId: t.Optional(t.Nullable(t.String())),
  includeSubdomains: t.Optional(t.Boolean()),
});

const SubdomainDnsRecordSchema = t.Object({
  type: t.String(),
  name: t.String(),
  value: t.String(),
  description: t.Optional(t.String()),
  isRequired: t.Boolean(),
});

const CatchAllEndpointSchema = t.Optional(
  t.Nullable(
    t.Object({
      id: t.String(),
      name: t.String(),
      type: t.String(),
      isActive: t.Boolean(),
    })
  )
);

const UpdateDomainResponse = t.Object({
  id: t.String(),
  domain: t.String(),
  status: t.String(),
  isCatchAllEnabled: t.Boolean(),
  catchAllEndpointId: t.Nullable(t.String()),
  catchAllEndpoint: CatchAllEndpointSchema,
  includeSubdomains: t.Boolean(),
  subdomainDnsRecords: t.Array(SubdomainDnsRecordSchema),
  updatedAt: t.String({ format: "date-time" }),
});

// Error response schema
const UpdateDomainErrorResponse = t.Object({
  error: t.String(),
  code: t.Optional(t.String()),
});

export const updateDomain = new Elysia().patch(
  "/domains/:id",
  async ({ request, params, body, set }) => {
    console.log(
      "✏️ PATCH /api/e2/domains/:id - Starting update for domain:",
      params.id
    );

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    console.log("📝 Update data received:", {
      isCatchAllEnabled: body.isCatchAllEnabled,
      catchAllEndpointId: body.catchAllEndpointId,
      includeSubdomains: body.includeSubdomains,
    });

    if (
      body.isCatchAllEnabled === undefined &&
      body.includeSubdomains === undefined
    ) {
      set.status = 400;
      return {
        error: "Provide isCatchAllEnabled and/or includeSubdomains to update",
      };
    }

    // Check if domain exists and belongs to user
    console.log("🔍 Checking if domain exists and belongs to user");
    const existingDomain = await db
      .select()
      .from(emailDomains)
      .where(
        and(eq(emailDomains.id, params.id), eq(emailDomains.userId, userId))
      )
      .limit(1);

    if (!existingDomain[0]) {
      console.log(
        "❌ Domain not found for user:",
        userId,
        "domain:",
        params.id
      );
      set.status = 404;
      return { error: "Domain not found" };
    }

    console.log("✅ Found existing domain:", existingDomain[0].domain);

    // Check if domain is verified
    if (existingDomain[0].status !== "verified") {
      console.log("❌ Domain not verified:", existingDomain[0].status);
      set.status = 400;
      return {
        error:
          body.isCatchAllEnabled === undefined
            ? "Domain must be verified before including subdomains"
            : "Domain must be verified before configuring catch-all",
      };
    }

    const wasIncludingSubdomains = existingDomain[0].includeSubdomains;
    const hasSubdomainRule = !!existingDomain[0].subdomainReceiptRuleName;
    const includeSubdomainsChange =
      body.includeSubdomains === undefined
        ? false
        : body.includeSubdomains
          ? !wasIncludingSubdomains || !hasSubdomainRule
          : wasIncludingSubdomains || hasSubdomainRule;

    if (body.includeSubdomains === true) {
      if (
        existingDomain[0].kind === "managed" ||
        isManagedDomainName(existingDomain[0].domain) ||
        !isRootDomain(existingDomain[0].domain)
      ) {
        console.log(
          "❌ includeSubdomains requires a root domain:",
          existingDomain[0].domain
        );
        set.status = 400;
        return {
          error:
            "Subdomain receiving can only be enabled on a verified root domain (for example example.com, not mail.example.com)",
          code: "INCLUDE_SUBDOMAINS_ROOT_ONLY",
        };
      }

      if (!wasIncludingSubdomains) {
        const foreignSubdomains = await findSubdomainsOwnedByOthers(
          existingDomain[0].domain,
          userId
        );
        if (foreignSubdomains.length > 0) {
          console.log(
            `❌ Cannot include subdomains - ${foreignSubdomains.length} subdomain(s) are owned by other accounts`
          );
          set.status = 409;
          return {
            error:
              "Cannot enable subdomain receiving because another account has already registered a subdomain of this domain",
            code: "SUBDOMAIN_OWNED_BY_ANOTHER_ACCOUNT",
          };
        }
      }
    }

    // Validate endpoint if enabling catch-all
    if (body.isCatchAllEnabled && body.catchAllEndpointId) {
      console.log("🔍 Validating endpoint");
      const endpointResult = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.id, body.catchAllEndpointId),
            eq(endpoints.userId, userId)
          )
        )
        .limit(1);

      if (!endpointResult[0]) {
        console.log("❌ Endpoint not found:", body.catchAllEndpointId);
        set.status = 400;
        return { error: "Endpoint not found or does not belong to user" };
      }

      if (!endpointResult[0].isActive) {
        console.log("❌ Endpoint is inactive:", body.catchAllEndpointId);
        set.status = 400;
        return { error: "Selected endpoint is not active" };
      }
    }

    // Defensive programming: Ensure domain is in SES batch rule when enabling
    const catchAllChange = body.isCatchAllEnabled !== undefined;
    const catchAllEnabled = catchAllChange
      ? body.isCatchAllEnabled === true
      : (existingDomain[0].isCatchAllEnabled ?? false);
    const catchAllEndpointId = catchAllChange
      ? catchAllEnabled
        ? body.catchAllEndpointId
        : null
      : existingDomain[0].catchAllEndpointId;
    let updatedReceiptRuleName = existingDomain[0].catchAllReceiptRuleName;

    // ENABLE catch-all: Ensure domain is in a batch rule (if not already)
    if (
      catchAllChange &&
      catchAllEnabled &&
      !existingDomain[0].catchAllReceiptRuleName?.startsWith("batch-rule-")
    ) {
      console.log(
        "🔧 Enabling catch-all - Domain not yet in batch catch-all, adding to batch rule"
      );

      try {
        // Get AWS configuration
        const awsRegion = process.env.AWS_REGION || "us-east-2";
        const lambdaFunctionName =
          process.env.LAMBDA_FUNCTION_NAME || "email-processor";
        const s3BucketName = process.env.S3_BUCKET_NAME;
        const awsAccountId = process.env.AWS_ACCOUNT_ID;

        if (!s3BucketName || !awsAccountId) {
          console.error(
            "⚠️ AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID"
          );
          set.status = 500;
          return {
            error:
              "AWS configuration incomplete. Cannot enable catch-all without proper AWS setup.",
          };
        }

        const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
          lambdaFunctionName,
          awsAccountId,
          awsRegion
        );

        const batchManager = new BatchRuleManager(
          "inbound-catchall-domain-default"
        );
        const sesManager = new AWSSESReceiptRuleManager(awsRegion);

        // Find or create rule with capacity
        const rule = await batchManager.findOrCreateRuleWithCapacity(1);
        console.log(
          `📋 Using batch rule: ${rule.ruleName} (${rule.currentCapacity}/${rule.availableSlots + rule.currentCapacity})`
        );

        // Add domain catch-all to batch rule
        await sesManager.configureBatchCatchAllRule({
          domains: [existingDomain[0].domain],
          lambdaFunctionArn: lambdaArn,
          s3BucketName,
          ruleSetName: "inbound-catchall-domain-default",
          ruleName: rule.ruleName,
        });

        // Increment rule capacity
        await batchManager.incrementRuleCapacity(rule.id, 1);

        updatedReceiptRuleName = rule.ruleName;
        console.log(`✅ Added domain to batch rule: ${rule.ruleName}`);
      } catch (error) {
        console.error("Failed to add domain to batch rule:", error);
        set.status = 500;
        return {
          error: `Failed to configure AWS SES for catch-all: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    } else if (catchAllChange && catchAllEnabled) {
      console.log(
        `✅ Domain already in batch rule: ${existingDomain[0].catchAllReceiptRuleName}`
      );
    }

    let includeSubdomains = wasIncludingSubdomains;
    let subdomainReceiptRuleName = existingDomain[0].subdomainReceiptRuleName;

    if (includeSubdomainsChange && body.includeSubdomains) {
      console.log(
        `🔧 Enabling subdomain receiving - adding .${existingDomain[0].domain} to batch rule`
      );

      try {
        const awsRegion = process.env.AWS_REGION || "us-east-2";
        const lambdaFunctionName =
          process.env.LAMBDA_FUNCTION_NAME || "email-processor";
        const s3BucketName = process.env.S3_BUCKET_NAME;
        const awsAccountId = process.env.AWS_ACCOUNT_ID;

        if (!s3BucketName || !awsAccountId) {
          console.error(
            "⚠️ AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID"
          );
          set.status = 500;
          return {
            error:
              "AWS configuration incomplete. Cannot enable subdomain receiving without proper AWS setup.",
          };
        }

        const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
          lambdaFunctionName,
          awsAccountId,
          awsRegion
        );
        const batchManager = new BatchRuleManager(SES_RULE_SET_NAME);
        const sesManager = new AWSSESReceiptRuleManager(awsRegion);

        const rule = await batchManager.findOrCreateRuleWithCapacity(1);
        await sesManager.configureBatchCatchAllRule({
          domains: [`.${existingDomain[0].domain}`],
          lambdaFunctionArn: lambdaArn,
          s3BucketName,
          ruleSetName: SES_RULE_SET_NAME,
          ruleName: rule.ruleName,
        });

        await batchManager.incrementRuleCapacity(rule.id, 1);

        includeSubdomains = true;
        subdomainReceiptRuleName = rule.ruleName;
        console.log(`✅ Added .${existingDomain[0].domain} to batch rule: ${rule.ruleName}`);
      } catch (error) {
        console.error("Failed to add subdomain wildcard to batch rule:", error);
        set.status = 500;
        return {
          error: `Failed to configure AWS SES for subdomain receiving: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    } else if (includeSubdomainsChange && existingDomain[0].subdomainReceiptRuleName) {
      console.log(
        `🔧 Disabling subdomain receiving - removing .${existingDomain[0].domain} from ${existingDomain[0].subdomainReceiptRuleName}`
      );

      const sesManager = new AWSSESReceiptRuleManager(
        process.env.AWS_REGION || "us-east-2"
      );
      const removeResult = await sesManager.removeDomainFromBatchRule({
        domain: `.${existingDomain[0].domain}`,
        ruleSetName: SES_RULE_SET_NAME,
        ruleName: existingDomain[0].subdomainReceiptRuleName,
      });

      if (!removeResult.success && removeResult.error !== "Rule not found") {
        set.status = 500;
        return {
          error: `Failed to remove subdomain receiving from AWS SES: ${removeResult.error ?? "Unknown error"}`,
        };
      }

      if (removeResult.success) {
        await new BatchRuleManager(
          SES_RULE_SET_NAME
        ).decrementRuleCapacityByName(
          existingDomain[0].subdomainReceiptRuleName,
          1
        );
      }

      includeSubdomains = false;
      subdomainReceiptRuleName = null;
    } else if (includeSubdomainsChange) {
      includeSubdomains = false;
      subdomainReceiptRuleName = null;
    }

    // DISABLE catch-all: Just update database flag (domain stays in SES batch rule)
    // Note: Domain remains in SES to receive individual email addresses
    // Filtering is handled by email-router.ts based on isCatchAllEnabled flag

    // Update domain in database
    console.log("💾 Updating domain in database");
    const [updatedDomain] = await db
      .update(emailDomains)
      .set({
        isCatchAllEnabled: catchAllEnabled,
        catchAllEndpointId: catchAllEndpointId,
        catchAllReceiptRuleName: updatedReceiptRuleName,
        includeSubdomains,
        subdomainReceiptRuleName,
        updatedAt: new Date(),
      })
      .where(eq(emailDomains.id, params.id))
      .returning();

    // Get updated endpoint information
    let catchAllEndpoint: {
      id: string;
      name: string;
      type: string;
      isActive: boolean;
    } | null = null;
    if (updatedDomain.catchAllEndpointId) {
      const endpointResult = await db
        .select({
          id: endpoints.id,
          name: endpoints.name,
          type: endpoints.type,
          isActive: endpoints.isActive,
        })
        .from(endpoints)
        .where(eq(endpoints.id, updatedDomain.catchAllEndpointId))
        .limit(1);

      const endpoint = endpointResult[0];
      if (endpoint) {
        catchAllEndpoint = {
          id: endpoint.id,
          name: endpoint.name,
          type: endpoint.type,
          isActive: endpoint.isActive || false,
        };
      }
    }

    console.log("✅ Successfully updated domain catch-all settings");

    return {
      id: updatedDomain.id,
      domain: updatedDomain.domain,
      status: updatedDomain.status,
      isCatchAllEnabled: updatedDomain.isCatchAllEnabled || false,
      catchAllEndpointId: updatedDomain.catchAllEndpointId,
      catchAllEndpoint,
      includeSubdomains: updatedDomain.includeSubdomains,
      subdomainDnsRecords: updatedDomain.includeSubdomains
        ? [getWildcardMxRecord(updatedDomain.domain)]
        : [],
      updatedAt: (updatedDomain.updatedAt || new Date()).toISOString(),
    };
  },
  {
    params: t.Object({
      id: t.String(),
    }),
    body: UpdateDomainBody,
    response: {
      200: UpdateDomainResponse,
      400: UpdateDomainErrorResponse,
      401: UpdateDomainErrorResponse,
      404: UpdateDomainErrorResponse,
      409: UpdateDomainErrorResponse,
      500: UpdateDomainErrorResponse,
    },
    detail: {
      tags: ["Domains"],
      summary: "Update domain catch-all and subdomain settings",
      description:
        "Update catch-all email settings for a domain. Catch-all receives emails sent to any address on your domain. Set includeSubdomains on a verified root domain to also receive mail for every subdomain (publish the returned wildcard MX record); subdomain mail is delivered to the root domain's catch-all endpoint. Domain must be verified first."
    },
  }
);
