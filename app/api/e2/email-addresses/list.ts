import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import {
  emailAddresses,
  emailDomains,
  endpoints,
  webhooks,
} from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

// Request/Response Types (OpenAPI-compatible)
const ListEmailAddressesQuery = t.Object({
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 50 })),
  offset: t.Optional(t.Number({ minimum: 0, default: 0 })),
  domainId: t.Optional(t.String()),
  isActive: t.Optional(t.String({ enum: ["true", "false"] })),
  isReceiptRuleConfigured: t.Optional(t.String({ enum: ["true", "false"] })),
});

const RoutingSchema = t.Object({
  type: t.Union([
    t.Literal("webhook"),
    t.Literal("endpoint"),
    t.Literal("none"),
  ]),
  id: t.Nullable(t.String()),
  name: t.Nullable(t.String()),
  config: t.Optional(t.Any({ "x-stainless-any": true })),
  isActive: t.Boolean(),
});

const DomainRefSchema = t.Object({
  id: t.String(),
  name: t.String(),
  status: t.String(),
});

const EmailAddressSchema = t.Object({
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
});

const PaginationSchema = t.Object({
  limit: t.Number(),
  offset: t.Number(),
  total: t.Number(),
  hasMore: t.Boolean(),
});

const ListEmailAddressesResponse = t.Object({
  data: t.Array(EmailAddressSchema),
  pagination: PaginationSchema,
});

const ErrorResponse = t.Object({
  error: t.String(),
  code: t.Optional(t.String()),
});

export const listEmailAddresses = new Elysia().get(
  "/email-addresses",
  async ({ request, query, set }) => {
    console.log("📧 GET /api/e2/email-addresses - Starting request");

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    // Extract and validate query parameters
    const limit = Math.min(parseInt(query.limit?.toString() || "50"), 100);
    const offset = parseInt(query.offset?.toString() || "0");
    const domainId = query.domainId;
    const isActive = query.isActive;
    const isReceiptRuleConfigured = query.isReceiptRuleConfigured;

    console.log("📊 Query parameters:", {
      limit,
      offset,
      domainId,
      isActive,
      isReceiptRuleConfigured,
    });

    // Build where conditions
    const conditions = [eq(emailAddresses.userId, userId)];

    if (domainId) {
      conditions.push(eq(emailAddresses.domainId, domainId));
      console.log("🔍 Filtering by domainId:", domainId);
    }

    if (isActive !== undefined) {
      const activeValue = isActive === "true";
      conditions.push(eq(emailAddresses.isActive, activeValue));
      console.log("🔍 Filtering by active status:", activeValue);
    }

    if (isReceiptRuleConfigured !== undefined) {
      const configuredValue = isReceiptRuleConfigured === "true";
      conditions.push(
        eq(emailAddresses.isReceiptRuleConfigured, configuredValue)
      );
      console.log("🔍 Filtering by receipt rule configured:", configuredValue);
    }

    const whereConditions =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    console.log("🔍 Querying email addresses from database");
    // Get email addresses with domains
    const userEmailAddresses = await db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        domainId: emailAddresses.domainId,
        webhookId: emailAddresses.webhookId,
        endpointId: emailAddresses.endpointId,
        isActive: emailAddresses.isActive,
        isReceiptRuleConfigured: emailAddresses.isReceiptRuleConfigured,
        receiptRuleName: emailAddresses.receiptRuleName,
        createdAt: emailAddresses.createdAt,
        updatedAt: emailAddresses.updatedAt,
        userId: emailAddresses.userId,
        domainName: emailDomains.domain,
        domainStatus: emailDomains.status,
      })
      .from(emailAddresses)
      .innerJoin(emailDomains, eq(emailAddresses.domainId, emailDomains.id))
      .where(whereConditions)
      .orderBy(desc(emailAddresses.createdAt))
      .limit(limit)
      .offset(offset);

    console.log(
      "📊 Retrieved email addresses count:",
      userEmailAddresses.length
    );

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(whereConditions);

    const totalCount = totalCountResult[0]?.count || 0;
    console.log("📊 Total email addresses count:", totalCount);

    // Enhance email addresses with routing information
    console.log("🔧 Enhancing email addresses with routing information");
    const enhancedEmailAddresses = await Promise.all(
      userEmailAddresses.map(async (emailAddress) => {
        let routing: {
          type: "webhook" | "endpoint" | "none";
          id: string | null;
          name: string | null;
          config?: any;
          isActive: boolean;
        } = {
          type: "none",
          id: null,
          name: null,
          isActive: false,
        };

        // Get endpoint or webhook routing info
        if (emailAddress.endpointId) {
          const endpoint = await db
            .select({
              id: endpoints.id,
              name: endpoints.name,
              type: endpoints.type,
              config: endpoints.config,
              isActive: endpoints.isActive,
            })
            .from(endpoints)
            .where(eq(endpoints.id, emailAddress.endpointId))
            .limit(1);

          if (endpoint[0]) {
            routing = {
              type: "endpoint",
              id: endpoint[0].id,
              name: endpoint[0].name,
              config: JSON.parse(endpoint[0].config),
              isActive: endpoint[0].isActive || false,
            };
          }
        } else if (emailAddress.webhookId) {
          const webhook = await db
            .select({
              id: webhooks.id,
              name: webhooks.name,
              url: webhooks.url,
              isActive: webhooks.isActive,
            })
            .from(webhooks)
            .where(eq(webhooks.id, emailAddress.webhookId))
            .limit(1);

          if (webhook[0]) {
            routing = {
              type: "webhook",
              id: webhook[0].id,
              name: webhook[0].name,
              config: { url: webhook[0].url },
              isActive: webhook[0].isActive || false,
            };
          }
        }

        return {
          id: emailAddress.id,
          address: emailAddress.address,
          domainId: emailAddress.domainId,
          webhookId: emailAddress.webhookId,
          endpointId: emailAddress.endpointId,
          isActive: emailAddress.isActive || false,
          isReceiptRuleConfigured:
            emailAddress.isReceiptRuleConfigured || false,
          receiptRuleName: emailAddress.receiptRuleName,
          createdAt: (emailAddress.createdAt || new Date()).toISOString(),
          updatedAt: (emailAddress.updatedAt || new Date()).toISOString(),
          userId: emailAddress.userId,
          domain: {
            id: emailAddress.domainId,
            name: emailAddress.domainName,
            status: emailAddress.domainStatus,
          },
          routing,
        };
      })
    );

    const response = {
      data: enhancedEmailAddresses,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + userEmailAddresses.length < totalCount,
      },
    };

    console.log(
      "✅ GET /api/e2/email-addresses - Successfully retrieved email addresses"
    );
    return response;
  },
  {
    query: ListEmailAddressesQuery,
    response: {
      200: ListEmailAddressesResponse,
      401: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Email Addresses"],
      summary: "List all email addresses",
      description:
        "Get paginated list of email addresses for authenticated user with optional filtering by domain, active status, and receipt rule configuration",
    },
  }
);
