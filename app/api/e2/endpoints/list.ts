import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import { endpoints, emailGroups, endpointDeliveries } from "@/lib/db/schema";
import { eq, and, desc, asc, count, ilike, or } from "drizzle-orm";

// Request/Response Types (OpenAPI-compatible)
const ListEndpointsQuery = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
  offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
  type: t.Optional(t.String({ enum: ["webhook", "email", "email_group"] })),
  active: t.Optional(t.String({ enum: ["true", "false"] })),
  sortBy: t.Optional(t.String({ enum: ["newest", "oldest"] })),
  search: t.Optional(t.String({ maxLength: 100 })),
});

const EndpointConfigSchema = t.Unknown();

const DeliveryStatsSchema = t.Object({
  total: t.Number(),
  successful: t.Number(),
  failed: t.Number(),
  lastDelivery: t.Nullable(t.String()),
});

const EndpointSchema = t.Object({
  id: t.String(),
  name: t.String(),
  type: t.Union([
    t.Literal("webhook"),
    t.Literal("email"),
    t.Literal("email_group"),
  ]),
  config: EndpointConfigSchema,
  isActive: t.Boolean(),
  description: t.Nullable(t.String()),
  userId: t.String(),
  createdAt: t.String(),
  updatedAt: t.String(),
  groupEmails: t.Nullable(t.Array(t.String())),
  deliveryStats: DeliveryStatsSchema,
});

const PaginationSchema = t.Object({
  limit: t.Number(),
  offset: t.Number(),
  total: t.Number(),
  hasMore: t.Boolean(),
});

const ListEndpointsResponse = t.Object({
  data: t.Array(EndpointSchema),
  pagination: PaginationSchema,
});

const ErrorResponse = t.Object({
  error: t.String(),
  message: t.String(),
  statusCode: t.Number(),
});

export const listEndpoints = new Elysia().get(
  "/endpoints",
  async ({ request, query, set }) => {
    console.log("🔗 GET /api/e2/endpoints - Starting request");

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    // Extract and validate query parameters
    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;
    const type = query.type;
    const active = query.active;
    const sortBy = query.sortBy;
    const search = query.search?.trim();

    console.log("📊 Query parameters:", {
      limit,
      offset,
      type,
      active,
      sortBy,
      search,
    });

    // Build where conditions
    const conditions = [eq(endpoints.userId, userId)];

    if (type && ["webhook", "email", "email_group"].includes(type)) {
      conditions.push(eq(endpoints.type, type));
      console.log("🔍 Filtering by type:", type);
    }

    if (active !== undefined) {
      const isActive = active === "true";
      conditions.push(eq(endpoints.isActive, isActive));
      console.log("🔍 Filtering by active status:", isActive);
    }

    if (search) {
      // Search by name OR config (which contains webhook URL, email addresses, etc.)
      conditions.push(
        or(
          ilike(endpoints.name, `%${search}%`),
          ilike(endpoints.config, `%${search}%`)
        )!
      );
      console.log("🔍 Searching by name or config:", search);
    }

    const whereConditions =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    // Determine sort order - default to newest first
    const sortOrder =
      sortBy === "oldest"
        ? asc(endpoints.createdAt)
        : desc(endpoints.createdAt);

    // Get endpoints
    console.log("🔍 Querying endpoints from database");
    const userEndpoints = await db
      .select({
        id: endpoints.id,
        name: endpoints.name,
        type: endpoints.type,
        config: endpoints.config,
        isActive: endpoints.isActive,
        description: endpoints.description,
        userId: endpoints.userId,
        createdAt: endpoints.createdAt,
        updatedAt: endpoints.updatedAt,
      })
      .from(endpoints)
      .where(whereConditions)
      .orderBy(sortOrder)
      .limit(limit)
      .offset(offset);

    console.log("📊 Retrieved endpoints count:", userEndpoints.length);

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: count() })
      .from(endpoints)
      .where(whereConditions);

    const totalCount = totalCountResult[0]?.count || 0;
    console.log("📊 Total endpoints count:", totalCount);

    // Enhance endpoints with additional data
    console.log("🔧 Enhancing endpoints with additional data");
    const enhancedEndpoints = await Promise.all(
      userEndpoints.map(async (endpoint) => {
        let groupEmails: string[] | null = null;

        // Add group emails for email_group endpoints
        if (endpoint.type === "email_group") {
          const groupEmailsResult = await db
            .select({ emailAddress: emailGroups.emailAddress })
            .from(emailGroups)
            .where(eq(emailGroups.endpointId, endpoint.id))
            .orderBy(emailGroups.createdAt);

          groupEmails = groupEmailsResult.map((g) => g.emailAddress);
        }

        // Get delivery statistics
        const deliveryStatsResult = await db
          .select({
            total: count(),
            status: endpointDeliveries.status,
          })
          .from(endpointDeliveries)
          .where(eq(endpointDeliveries.endpointId, endpoint.id))
          .groupBy(endpointDeliveries.status);

        let totalDeliveries = 0;
        let successfulDeliveries = 0;
        let failedDeliveries = 0;

        for (const stat of deliveryStatsResult) {
          totalDeliveries += stat.total;
          if (stat.status === "success") successfulDeliveries += stat.total;
          if (stat.status === "failed") failedDeliveries += stat.total;
        }

        // Get the most recent delivery date
        const lastDeliveryResult = await db
          .select({ lastDelivery: endpointDeliveries.lastAttemptAt })
          .from(endpointDeliveries)
          .where(eq(endpointDeliveries.endpointId, endpoint.id))
          .orderBy(desc(endpointDeliveries.lastAttemptAt))
          .limit(1);

        const lastDeliveryDate = lastDeliveryResult[0]?.lastDelivery || null;

        return {
          id: endpoint.id,
          name: endpoint.name,
          type: endpoint.type as "webhook" | "email" | "email_group",
          config: JSON.parse(endpoint.config),
          isActive: endpoint.isActive || false,
          description: endpoint.description,
          userId: endpoint.userId,
          createdAt: endpoint.createdAt
            ? new Date(endpoint.createdAt).toISOString()
            : new Date().toISOString(),
          updatedAt: endpoint.updatedAt
            ? new Date(endpoint.updatedAt).toISOString()
            : new Date().toISOString(),
          groupEmails,
          deliveryStats: {
            total: totalDeliveries,
            successful: successfulDeliveries,
            failed: failedDeliveries,
            lastDelivery: lastDeliveryDate
              ? new Date(lastDeliveryDate).toISOString()
              : null,
          },
        };
      })
    );

    console.log("✅ Successfully enhanced all endpoints");

    return {
      data: enhancedEndpoints,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount,
      },
    };
  },
  {
    query: ListEndpointsQuery,
    response: {
      200: ListEndpointsResponse,
      401: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Endpoints"],
      summary: "List all endpoints",
      description:
        "Get paginated list of endpoints for authenticated user with optional filtering by type, active status, sort order, and search by name",
    },
  }
);
