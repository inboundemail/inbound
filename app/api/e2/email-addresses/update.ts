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
import type { EmailAddress } from "@/lib/db/schema";

// Request/Response Types (OpenAPI-compatible)
const UpdateEmailAddressBody = t.Object({
  endpointId: t.Optional(t.Nullable(t.String())),
  webhookId: t.Optional(t.Nullable(t.String())),
  isActive: t.Optional(t.Boolean()),
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

const UpdateEmailAddressResponse = t.Object({
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
});

export const updateEmailAddress = new Elysia().put(
  "/email-addresses/:id",
  async ({ request, params, body, set }) => {
    console.log("📝 PUT /api/e2/email-addresses/:id - Starting request");

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    console.log("📋 Request data:", {
      endpointId: body.endpointId,
      webhookId: body.webhookId,
      isActive: body.isActive,
    });

    // Get current email address
    console.log("🔍 Looking up current email address:", params.id);
    const currentEmailAddress = await db
      .select()
      .from(emailAddresses)
      .where(
        and(eq(emailAddresses.id, params.id), eq(emailAddresses.userId, userId))
      )
      .limit(1);

    if (!currentEmailAddress[0]) {
      console.log("❌ Email address not found:", params.id);
      set.status = 404;
      return { error: "Email address not found" };
    }

    // Get domain information
    const domainResult = await db
      .select()
      .from(emailDomains)
      .where(eq(emailDomains.id, currentEmailAddress[0].domainId))
      .limit(1);

    if (!domainResult[0]) {
      console.log(
        "❌ Domain not found for email address:",
        currentEmailAddress[0].domainId
      );
      set.status = 404;
      return { error: "Domain not found" };
    }

    // Validate endpoint/webhook if provided
    let endpointId = body.endpointId;
    let webhookId = body.webhookId;
    let routingInfo: {
      type: "webhook" | "endpoint" | "none";
      id: string | null;
      name: string | null;
      config?: any;
      isActive: boolean;
    } | null = null;

    // Clear conflicting routing (can't have both endpoint and webhook)
    if (endpointId !== undefined && webhookId !== undefined) {
      if (endpointId && webhookId) {
        console.log("❌ Cannot specify both endpoint and webhook");
        set.status = 400;
        return { error: "Cannot specify both endpoint and webhook" };
      }
    }

    // Validate endpoint if provided
    if (endpointId) {
      console.log("🔍 Validating endpoint:", endpointId);
      const endpointResult = await db
        .select()
        .from(endpoints)
        .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
        .limit(1);

      if (!endpointResult[0]) {
        console.log("❌ Endpoint not found or access denied:", endpointId);
        set.status = 404;
        return { error: "Endpoint not found or access denied" };
      }
      routingInfo = {
        type: "endpoint",
        id: endpointResult[0].id,
        name: endpointResult[0].name,
        config: JSON.parse(endpointResult[0].config),
        isActive: endpointResult[0].isActive || false,
      };
    } else if (webhookId) {
      console.log("🔍 Validating webhook:", webhookId);
      const webhookResult = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
        .limit(1);

      if (!webhookResult[0]) {
        console.log("❌ Webhook not found or access denied:", webhookId);
        set.status = 404;
        return { error: "Webhook not found or access denied" };
      }
      routingInfo = {
        type: "webhook",
        id: webhookResult[0].id,
        name: webhookResult[0].name,
        config: { url: webhookResult[0].url },
        isActive: webhookResult[0].isActive || false,
      };
    }

    // Update email address
    console.log("📝 Updating email address record");
    const updateData: Partial<EmailAddress> = {
      updatedAt: new Date(),
    };

    if (body.endpointId !== undefined) {
      updateData.endpointId = endpointId;
      updateData.webhookId = null;
    }
    if (body.webhookId !== undefined) {
      updateData.webhookId = webhookId;
      updateData.endpointId = null;
    }
    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive;
    }

    const [updatedEmailAddress] = await db
      .update(emailAddresses)
      .set(updateData)
      .where(eq(emailAddresses.id, params.id))
      .returning();

    console.log("✅ Email address updated successfully");

    // If no routing info was set (when clearing routing or not updating it), fetch current routing
    if (!routingInfo) {
      if (updatedEmailAddress.endpointId) {
        const endpoint = await db
          .select()
          .from(endpoints)
          .where(eq(endpoints.id, updatedEmailAddress.endpointId))
          .limit(1);

        if (endpoint[0]) {
          routingInfo = {
            type: "endpoint",
            id: endpoint[0].id,
            name: endpoint[0].name,
            config: JSON.parse(endpoint[0].config),
            isActive: endpoint[0].isActive || false,
          };
        }
      } else if (updatedEmailAddress.webhookId) {
        const webhook = await db
          .select()
          .from(webhooks)
          .where(eq(webhooks.id, updatedEmailAddress.webhookId))
          .limit(1);

        if (webhook[0]) {
          routingInfo = {
            type: "webhook",
            id: webhook[0].id,
            name: webhook[0].name,
            config: { url: webhook[0].url },
            isActive: webhook[0].isActive || false,
          };
        }
      }
    }

    const response = {
      id: updatedEmailAddress.id,
      address: updatedEmailAddress.address,
      domainId: updatedEmailAddress.domainId,
      webhookId: updatedEmailAddress.webhookId,
      endpointId: updatedEmailAddress.endpointId,
      isActive: updatedEmailAddress.isActive || false,
      isReceiptRuleConfigured:
        updatedEmailAddress.isReceiptRuleConfigured || false,
      receiptRuleName: updatedEmailAddress.receiptRuleName,
      createdAt: (updatedEmailAddress.createdAt || new Date()).toISOString(),
      updatedAt: (updatedEmailAddress.updatedAt || new Date()).toISOString(),
      userId: updatedEmailAddress.userId,
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
    };

    console.log(
      "✅ PUT /api/e2/email-addresses/:id - Successfully updated email address"
    );
    return response;
  },
  {
    params: t.Object({
      id: t.String(),
    }),
    body: UpdateEmailAddressBody,
    response: {
      200: UpdateEmailAddressResponse,
      400: ErrorResponse,
      401: ErrorResponse,
      404: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Email Addresses"],
      summary: "Update email address",
      description:
        "Update an email address's routing (endpoint/webhook) or active status. Cannot have both endpoint and webhook.",
    },
  }
);
