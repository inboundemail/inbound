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

// Response Types (OpenAPI-compatible)
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

const EmailAddressResponse = t.Object({
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

const ErrorResponse = t.Object({
  error: t.String(),
  code: t.Optional(t.String()),
});

export const getEmailAddress = new Elysia().get(
  "/email-addresses/:id",
  async ({ request, params, set }) => {
    console.log("📧 GET /api/e2/email-addresses/:id - Starting request");

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    console.log("🔍 Looking up email address:", params.id);

    // Get email address with domain information
    const emailAddressResult = await db
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
      .where(
        and(eq(emailAddresses.id, params.id), eq(emailAddresses.userId, userId))
      )
      .limit(1);

    if (!emailAddressResult[0]) {
      console.log("❌ Email address not found:", params.id);
      set.status = 404;
      return { error: "Email address not found" };
    }

    const emailAddress = emailAddressResult[0];
    console.log("✅ Found email address:", emailAddress.address);

    // Get routing information
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

    if (emailAddress.endpointId) {
      console.log("🔍 Looking up endpoint routing:", emailAddress.endpointId);
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
      console.log("🔍 Looking up webhook routing:", emailAddress.webhookId);
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

    const response = {
      id: emailAddress.id,
      address: emailAddress.address,
      domainId: emailAddress.domainId,
      webhookId: emailAddress.webhookId,
      endpointId: emailAddress.endpointId,
      isActive: emailAddress.isActive || false,
      isReceiptRuleConfigured: emailAddress.isReceiptRuleConfigured || false,
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

    console.log(
      "✅ GET /api/e2/email-addresses/:id - Successfully retrieved email address"
    );
    return response;
  },
  {
    params: t.Object({
      id: t.String(),
    }),
    response: {
      200: EmailAddressResponse,
      401: ErrorResponse,
      404: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Email Addresses"],
      summary: "Get email address",
      description:
        "Get a specific email address by ID with detailed information including routing configuration",
    },
  }
);
