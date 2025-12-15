import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import { endpoints, emailGroups } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { validateEndpointConfig } from "./validation";

// Request/Response Types (OpenAPI-compatible)
const EndpointParamsSchema = t.Object({
  id: t.String(),
});

// Define headers schema with explicit additionalProperties for proper OpenAPI generation
const HeadersSchema = t.Optional(
  t.Unsafe<Record<string, string>>({
    type: "object",
    additionalProperties: { type: "string" },
    description: "Custom headers to include with webhook requests",
  })
);

const WebhookConfigSchema = t.Object(
  {
    url: t.String(),
    timeout: t.Optional(t.Number({ minimum: 1, maximum: 300 })),
    retryAttempts: t.Optional(t.Number({ minimum: 0, maximum: 10 })),
    headers: HeadersSchema,
  },
  { title: "WebhookConfig" }
);

const EmailConfigSchema = t.Object(
  {
    forwardTo: t.String({ format: "email" }),
    preserveHeaders: t.Optional(t.Boolean()),
  },
  { title: "EmailConfig" }
);

const EmailGroupConfigSchema = t.Object(
  {
    emails: t.Array(t.String({ format: "email" }), {
      minItems: 1,
      maxItems: 50,
    }),
    preserveHeaders: t.Optional(t.Boolean()),
  },
  { title: "EmailGroupConfig" }
);

const UpdateEndpointBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String({ maxLength: 1000 })),
  isActive: t.Optional(t.Boolean()),
  config: t.Optional(
    t.Union([WebhookConfigSchema, EmailConfigSchema, EmailGroupConfigSchema])
  ),
  webhookFormat: t.Optional(
    t.Union([t.Literal("inbound"), t.Literal("discord"), t.Literal("slack")])
  ),
});

const EndpointResponse = t.Object({
  id: t.String(),
  name: t.String(),
  type: t.Union([
    t.Literal("webhook"),
    t.Literal("email"),
    t.Literal("email_group"),
  ]),
  config: t.Any({ "x-stainless-any": true }),
  isActive: t.Boolean(),
  description: t.Nullable(t.String()),
  userId: t.String(),
  createdAt: t.Nullable(t.String()),
  updatedAt: t.Nullable(t.String()),
  groupEmails: t.Nullable(t.Array(t.String())),
});

const ErrorResponse = t.Object({
  error: t.String(),
  message: t.String(),
  statusCode: t.Number(),
});

const NotFoundResponse = t.Object({
  error: t.String(),
});

const ValidationErrorResponse = t.Object({
  error: t.String(),
  details: t.Optional(t.String()),
});

export const updateEndpoint = new Elysia().put(
  "/endpoints/:id",
  async ({ request, params, body, set }) => {
    const { id } = params;
    console.log(
      "✏️ PUT /api/e2/endpoints/:id - Starting update for endpoint:",
      id
    );

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    console.log("📝 Update data received:", {
      hasName: !!body.name,
      hasDescription: body.description !== undefined,
      hasIsActive: body.isActive !== undefined,
      hasConfig: !!body.config,
      hasWebhookFormat: body.webhookFormat !== undefined,
    });

    // Check if endpoint exists and belongs to user
    console.log("🔍 Checking if endpoint exists and belongs to user");
    const existingEndpoint = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.id, id), eq(endpoints.userId, userId)))
      .limit(1);

    if (!existingEndpoint[0]) {
      console.log("❌ Endpoint not found for user:", userId, "endpoint:", id);
      set.status = 404;
      return { error: "Endpoint not found" };
    }

    console.log(
      "✅ Found existing endpoint:",
      existingEndpoint[0].name,
      "type:",
      existingEndpoint[0].type
    );

    // Validate config if provided
    if (body.config) {
      console.log("🔍 Validating endpoint configuration");
      const validationResult = validateEndpointConfig(
        existingEndpoint[0].type,
        body.config
      );
      if (!validationResult.valid) {
        console.log(
          "❌ Configuration validation failed:",
          validationResult.error
        );
        set.status = 400;
        return {
          error: "Invalid configuration",
          details: validationResult.error,
        };
      }
      console.log("✅ Configuration validation passed");
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.config !== undefined)
      updateData.config = JSON.stringify(body.config);
    if (
      body.webhookFormat !== undefined &&
      existingEndpoint[0].type === "webhook"
    ) {
      updateData.webhookFormat = body.webhookFormat;
    }

    console.log("💾 Updating endpoint with fields:", Object.keys(updateData));

    // Update the endpoint
    const [updatedEndpoint] = await db
      .update(endpoints)
      .set(updateData)
      .where(eq(endpoints.id, id))
      .returning();

    console.log("✅ Endpoint updated successfully");

    // If config was updated and it's an email group, update the group entries
    if (
      body.config &&
      existingEndpoint[0].type === "email_group" &&
      "emails" in body.config
    ) {
      console.log("📧 Updating email group entries");

      // Delete existing group entries
      await db.delete(emailGroups).where(eq(emailGroups.endpointId, id));
      console.log("🗑️ Deleted existing group entries");

      // Create new group entries
      const emails = body.config.emails as string[];
      const groupEntries = emails.map((email) => ({
        id: nanoid(),
        endpointId: id,
        emailAddress: email,
        createdAt: new Date(),
      }));

      if (groupEntries.length > 0) {
        await db.insert(emailGroups).values(groupEntries);
        console.log("✅ Created", groupEntries.length, "new group entries");
      }
    }

    // Get updated group emails if needed
    let groupEmails: string[] | null = null;
    if (updatedEndpoint.type === "email_group") {
      console.log("📧 Fetching updated group emails");
      const groupEmailsResult = await db
        .select({ emailAddress: emailGroups.emailAddress })
        .from(emailGroups)
        .where(eq(emailGroups.endpointId, id))
        .orderBy(emailGroups.createdAt);

      groupEmails = groupEmailsResult.map((g) => g.emailAddress);
      console.log("📧 Found", groupEmails.length, "updated group emails");
    }

    const response = {
      id: updatedEndpoint.id,
      name: updatedEndpoint.name,
      type: updatedEndpoint.type as "webhook" | "email" | "email_group",
      config: JSON.parse(updatedEndpoint.config),
      isActive: updatedEndpoint.isActive || false,
      description: updatedEndpoint.description,
      userId: updatedEndpoint.userId,
      createdAt: updatedEndpoint.createdAt
        ? new Date(updatedEndpoint.createdAt).toISOString()
        : null,
      updatedAt: updatedEndpoint.updatedAt
        ? new Date(updatedEndpoint.updatedAt).toISOString()
        : null,
      groupEmails,
    };

    console.log(
      "✅ PUT /api/e2/endpoints/:id - Successfully returning updated endpoint"
    );
    return response;
  },
  {
    params: EndpointParamsSchema,
    body: UpdateEndpointBody,
    response: {
      200: EndpointResponse,
      400: ValidationErrorResponse,
      401: ErrorResponse,
      404: NotFoundResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Endpoints"],
      summary: "Update endpoint",
      description:
        "Update an existing endpoint's name, description, active status, config, or webhook format",
    },
  }
);
