import { Elysia, t } from "elysia";
import { eq, and, desc, sql, or, like, gte, inArray, type SQL } from "drizzle-orm";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import { db } from "@/lib/db";
import {
  sentEmails,
  structuredEmails,
  scheduledEmails,
  emailDomains,
  emailAddresses,
} from "@/lib/db/schema";

// Query parameters schema with full OpenAPI descriptions
const ListEmailsQuerySchema = t.Object({
  type: t.Optional(
    t.Union(
      [
        t.Literal("all"),
        t.Literal("sent"),
        t.Literal("received"),
        t.Literal("scheduled"),
      ],
      {
        description:
          "Filter by email type. 'all' returns sent, received, and scheduled emails combined.",
        default: "all",
      }
    )
  ),
  status: t.Optional(
    t.Union(
      [
        t.Literal("all"),
        t.Literal("delivered"),
        t.Literal("pending"),
        t.Literal("failed"),
        t.Literal("bounced"),
        t.Literal("scheduled"),
        t.Literal("cancelled"),
        t.Literal("paused"),
        t.Literal("unread"),
        t.Literal("read"),
        t.Literal("archived"),
      ],
      {
        description:
          "Filter by email status. 'unread', 'read', and 'archived' only apply to received emails.",
      }
    )
  ),
  time_range: t.Optional(
    t.Union(
      [
        t.Literal("1h"),
        t.Literal("24h"),
        t.Literal("7d"),
        t.Literal("30d"),
        t.Literal("90d"),
        t.Literal("all"),
      ],
      {
        description:
          "Filter emails by time range. Defaults to '30d' (last 30 days).",
        default: "30d",
      }
    )
  ),
  search: t.Optional(
    t.String({
      description:
        "Search query to filter emails by subject, sender, or recipient. Case-insensitive partial match.",
    })
  ),
  domain: t.Optional(
    t.String({
      description:
        "Filter by domain. Accepts domain ID (e.g., 'dom_xxx') or domain name (e.g., 'example.com').",
    })
  ),
  address: t.Optional(
    t.String({
      description:
        "Filter by email address. Accepts address ID (e.g., 'addr_xxx') or raw email address (e.g., 'user@example.com').",
    })
  ),
  limit: t.Optional(
    t.String({
      description: "Maximum number of emails to return (1-100). Default is 50.",
      default: "50",
    })
  ),
  offset: t.Optional(
    t.String({
      description: "Number of emails to skip for pagination. Default is 0.",
      default: "0",
    })
  ),
});

// Email item schema with full OpenAPI descriptions
const EmailItemSchema = t.Object({
  id: t.String({ description: "Unique identifier for the email" }),
  type: t.Union(
    [t.Literal("sent"), t.Literal("received"), t.Literal("scheduled")],
    { description: "The type/direction of the email" }
  ),
  message_id: t.Optional(
    t.Nullable(t.String({ description: "RFC 2822 Message-ID header value" }))
  ),
  from: t.String({ description: "Sender email address" }),
  from_name: t.Optional(
    t.Nullable(t.String({ description: "Sender display name if available" }))
  ),
  to: t.Array(t.String(), {
    description: "Array of recipient email addresses",
  }),
  envelope_recipient: t.Optional(
    t.Nullable(t.String({ description: "Stored delivery recipient for received emails, independent of message headers" }))
  ),
  cc: t.Optional(
    t.Array(t.String(), {
      description: "Array of CC recipient email addresses",
    })
  ),
  subject: t.String({ description: "Email subject line" }),
  preview: t.Optional(
    t.Nullable(
      t.String({
        description: "First 200 characters of the email body as a preview",
      })
    )
  ),
  status: t.String({
    description:
      "Current status of the email (delivered, pending, failed, bounced, scheduled, cancelled)",
  }),
  created_at: t.String({
    description: "ISO 8601 timestamp when the email was created/received",
  }),
  sent_at: t.Optional(
    t.Nullable(
      t.String({ description: "ISO 8601 timestamp when the email was sent" })
    )
  ),
  scheduled_at: t.Optional(
    t.Nullable(
      t.String({
        description:
          "ISO 8601 timestamp when the email is scheduled to be sent",
      })
    )
  ),
  has_attachments: t.Boolean({
    description: "Whether the email has any attachments",
  }),
  attachment_count: t.Optional(
    t.Number({ description: "Number of attachments on the email" })
  ),
  is_read: t.Optional(
    t.Boolean({
      description: "Whether the email has been read (only for received emails)",
    })
  ),
  read_at: t.Optional(
    t.Nullable(
      t.String({
        description:
          "ISO 8601 timestamp when the email was marked as read (only for received emails)",
      })
    )
  ),
  is_archived: t.Optional(
    t.Boolean({
      description:
        "Whether the email has been archived (only for received emails)",
    })
  ),
  thread_id: t.Optional(
    t.Nullable(
      t.String({
        description: "ID of the thread this email belongs to, if threaded",
      })
    )
  ),
});

// Response schemas
const ListEmailsResponse = t.Object({
  data: t.Array(EmailItemSchema, {
    description: "Array of email objects matching the query",
  }),
  pagination: t.Object(
    {
      limit: t.Number({ description: "Number of results per page" }),
      offset: t.Number({ description: "Number of results skipped" }),
      total: t.Number({ description: "Total number of matching emails" }),
      has_more: t.Boolean({
        description: "Whether there are more results available",
      }),
    },
    { description: "Pagination metadata" }
  ),
  filters: t.Object(
    {
      type: t.Optional(t.String({ description: "Applied type filter" })),
      status: t.Optional(t.String({ description: "Applied status filter" })),
      time_range: t.Optional(
        t.String({ description: "Applied time range filter" })
      ),
      search: t.Optional(t.String({ description: "Applied search query" })),
      domain: t.Optional(t.String({ description: "Applied domain filter" })),
      address: t.Optional(t.String({ description: "Applied address filter" })),
    },
    { description: "Applied filters for this query" }
  ),
});

const ListEmailsErrorResponse = t.Object({
  error: t.String({ description: "Error message describing what went wrong" }),
});

// Helper to parse JSON fields safely
function parseJsonField<T>(field: string | null, fallback: T): T {
  if (!field) return fallback;
  try {
    return JSON.parse(field);
  } catch {
    return fallback;
  }
}

function parseFromData(field: string | null): {
  address: string;
  name: string | null;
} {
  if (!field) return { address: "unknown", name: null };
  try {
    const parsed = JSON.parse(field);
    return {
      address: parsed?.addresses?.[0]?.address || parsed?.text || "unknown",
      name: parsed?.addresses?.[0]?.name || null,
    };
  } catch {
    return { address: "unknown", name: null };
  }
}

function parseAddressesFromData(field: string | null): string[] {
  if (!field) return [];
  try {
    const parsed = JSON.parse(field);
    return parsed?.addresses?.map((a: { address?: string }) => a.address).filter(Boolean) || [];
  } catch {
    return [];
  }
}

// Calculate time threshold from time_range parameter
function getTimeThreshold(timeRange: string): Date | null {
  if (timeRange === "all") return null;

  const now = new Date();
  switch (timeRange) {
    case "1h":
      return new Date(now.getTime() - 1 * 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export const listEmails = new Elysia().get(
  "/emails",
  async ({ request, query, set }) => {
    console.log("📧 GET /api/e2/emails - Starting request");

    // Auth & rate limit validation
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    // Parse query parameters
    const type = query.type || "all";
    const status = query.status || "all";
    const timeRange = query.time_range || "30d";
    const searchQuery = query.search?.trim();
    const limit = Math.min(parseInt(query.limit || "50"), 100);
    const offset = parseInt(query.offset || "0");
    const domainFilter = query.domain;
    const addressFilter = query.address;

    console.log("📊 Query parameters:", {
      type,
      status,
      timeRange,
      searchQuery,
      limit,
      offset,
      domainFilter,
      addressFilter,
    });

    // Validate parameters
    if (limit < 1 || limit > 100) {
      set.status = 400;
      return { error: "Limit must be between 1 and 100" };
    }

    if (offset < 0) {
      set.status = 400;
      return { error: "Offset must be non-negative" };
    }

    let emails: (typeof EmailItemSchema.static)[] = [];
    let total = 0;
    const timeThreshold = getTimeThreshold(timeRange);
    const fallbackCreatedAt = new Date().toISOString();

    // Resolve domain filter - supports ID, registered domain, or raw domain name
    let resolvedDomain: string | null = null;
    if (domainFilter) {
      const domain = await db
        .select()
        .from(emailDomains)
        .where(
          and(
            eq(emailDomains.userId, userId),
            or(
              eq(emailDomains.id, domainFilter),
              eq(emailDomains.domain, domainFilter)
            )
          )
        )
        .limit(1);

      // Use resolved domain or raw filter value
      resolvedDomain = domain.length > 0 ? domain[0].domain : domainFilter;
    }

    // Resolve address filter - supports ID, registered address, or raw email
    let resolvedAddress: string | null = null;
    if (addressFilter) {
      const address = await db
        .select()
        .from(emailAddresses)
        .where(
          and(
            eq(emailAddresses.userId, userId),
            or(
              eq(emailAddresses.id, addressFilter),
              eq(emailAddresses.address, addressFilter)
            )
          )
        )
        .limit(1);

      // Use resolved address or raw filter value
      resolvedAddress = address.length > 0 ? address[0].address : addressFilter;
    }

    const receivedConditions: (SQL | undefined)[] = [eq(structuredEmails.userId, userId)];
    const sentConditions: (SQL | undefined)[] = [eq(sentEmails.userId, userId)];
    const scheduledConditions: (SQL | undefined)[] = [eq(scheduledEmails.userId, userId)];
    const includeReceived = type === "all" || type === "received";
    const includeSent = (type === "all" || type === "sent") &&
      !["unread", "read", "archived", "scheduled", "cancelled", "paused"].includes(status);
    const includeScheduled = (type === "all" || type === "scheduled") &&
      !["unread", "read", "archived", "delivered", "bounced"].includes(status);

    if (includeReceived) {
      // Time range filter
      if (timeThreshold) {
        receivedConditions.push(gte(structuredEmails.createdAt, timeThreshold));
      }

      // Status filters for received emails
      if (status === "delivered") {
        receivedConditions.push(eq(structuredEmails.parseSuccess, true));
      } else if (status === "failed") {
        receivedConditions.push(eq(structuredEmails.parseSuccess, false));
      } else if (status === "unread") {
        receivedConditions.push(eq(structuredEmails.isRead, false));
        receivedConditions.push(eq(structuredEmails.isArchived, false));
      } else if (status === "read") {
        receivedConditions.push(eq(structuredEmails.isRead, true));
      } else if (status === "archived") {
        receivedConditions.push(eq(structuredEmails.isArchived, true));
      }

      // Domain filter
      if (resolvedDomain) {
        receivedConditions.push(
          like(structuredEmails.recipient, `%@${resolvedDomain}`)
        );
      }

      // Address filter - match recipient or in toData
      if (resolvedAddress) {
        receivedConditions.push(
          or(
            eq(structuredEmails.recipient, resolvedAddress),
            like(structuredEmails.toData, `%${resolvedAddress}%`)
          )
        );
      }

      // Search filter
      if (searchQuery) {
        const searchPattern = `%${searchQuery}%`;
        receivedConditions.push(
          sql`(${structuredEmails.subject} ILIKE ${searchPattern} OR ${structuredEmails.fromData}::text ILIKE ${searchPattern} OR ${structuredEmails.toData}::text ILIKE ${searchPattern})`
        );
      }
    }

    if (includeSent) {
      // Time range filter
      if (timeThreshold) {
        sentConditions.push(gte(sentEmails.createdAt, timeThreshold));
      }

      // Status filters for sent emails
      if (status === "delivered") {
        sentConditions.push(eq(sentEmails.status, "sent"));
      } else if (status === "pending") {
        sentConditions.push(eq(sentEmails.status, "pending"));
      } else if (status === "failed") {
        sentConditions.push(eq(sentEmails.status, "failed"));
      } else if (status === "bounced") {
        sentConditions.push(eq(sentEmails.status, "bounced"));
      }

      // Domain filter
      if (resolvedDomain) {
        sentConditions.push(eq(sentEmails.fromDomain, resolvedDomain));
      }

      // Address filter - match from address or in to addresses
      if (resolvedAddress) {
        sentConditions.push(
          or(
            eq(sentEmails.fromAddress, resolvedAddress),
            like(sentEmails.to, `%${resolvedAddress}%`)
          )
        );
      }

      // Search filter
      if (searchQuery) {
        const searchPattern = `%${searchQuery}%`;
        sentConditions.push(
          sql`(${sentEmails.subject} ILIKE ${searchPattern} OR ${sentEmails.from} ILIKE ${searchPattern} OR ${sentEmails.to}::text ILIKE ${searchPattern})`
        );
      }
    }

    if (includeScheduled) {
      if (timeThreshold) {
        scheduledConditions.push(gte(scheduledEmails.createdAt, timeThreshold));
      }

      // Status filters for scheduled emails
      if (status === "scheduled") {
        scheduledConditions.push(eq(scheduledEmails.status, "scheduled"));
      } else if (status === "cancelled") {
        scheduledConditions.push(eq(scheduledEmails.status, "cancelled"));
      } else if (status === "paused") {
        scheduledConditions.push(eq(scheduledEmails.status, "paused"));
      } else if (status === "pending") {
        scheduledConditions.push(eq(scheduledEmails.status, "processing"));
      } else if (status === "failed") {
        scheduledConditions.push(eq(scheduledEmails.status, "failed"));
      }

      // Domain filter
      if (resolvedDomain) {
        scheduledConditions.push(eq(scheduledEmails.fromDomain, resolvedDomain));
      }

      // Address filter
      if (resolvedAddress) {
        scheduledConditions.push(
          or(
            eq(scheduledEmails.fromAddress, resolvedAddress),
            like(scheduledEmails.toAddresses, `%${resolvedAddress}%`)
          )
        );
      }

      // Search filter
      if (searchQuery) {
        const searchPattern = `%${searchQuery}%`;
        scheduledConditions.push(
          sql`(${scheduledEmails.subject} ILIKE ${searchPattern} OR ${scheduledEmails.fromAddress} ILIKE ${searchPattern} OR ${scheduledEmails.toAddresses}::text ILIKE ${searchPattern})`
        );
      }
    }

    let page: { id: string; typeOrder: number }[] = [];
    if (type === "all") {
      const matchingEmails = db
        .select({
          id: structuredEmails.id,
          typeOrder: sql<number>`0`.as("type_order"),
          createdAt: structuredEmails.createdAt,
        })
        .from(structuredEmails)
        .where(and(...receivedConditions))
        .unionAll(
          db.select({
            id: sentEmails.id,
            typeOrder: sql<number>`1`.as("type_order"),
            createdAt: sentEmails.createdAt,
          })
            .from(sentEmails)
            .where(and(...sentConditions, includeSent ? undefined : sql`false`))
        )
        .unionAll(
          db.select({
            id: scheduledEmails.id,
            typeOrder: sql<number>`2`.as("type_order"),
            createdAt: scheduledEmails.createdAt,
          })
            .from(scheduledEmails)
            .where(and(...scheduledConditions, includeScheduled ? undefined : sql`false`))
        )
        .as("matching_emails");

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(matchingEmails);
      total = Number(count);
      if (Number.isFinite(limit) && Number.isFinite(offset) && offset < total) {
        page = await db
          .select()
          .from(matchingEmails)
          .orderBy(
            desc(sql`date_trunc('milliseconds', coalesce(${matchingEmails.createdAt}, ${fallbackCreatedAt}::timestamp))`),
            matchingEmails.typeOrder,
            desc(matchingEmails.createdAt)
          )
          .limit(limit)
          .offset(offset);
      }
    }

    const receivedIds = page.filter((email) => email.typeOrder === 0).map((email) => email.id);
    const sentIds = page.filter((email) => email.typeOrder === 1).map((email) => email.id);
    const scheduledIds = page.filter((email) => email.typeOrder === 2).map((email) => email.id);

    if (includeReceived && (type !== "all" || receivedIds.length > 0)) {
      const receivedEmails = await db
        .select({
          id: structuredEmails.id,
          recipient: structuredEmails.recipient,
          messageId: structuredEmails.messageId,
          fromData: structuredEmails.fromData,
          toData: structuredEmails.toData,
          ccData: structuredEmails.ccData,
          subject: structuredEmails.subject,
          textBody: structuredEmails.textBody,
          attachments: structuredEmails.attachments,
          parseSuccess: structuredEmails.parseSuccess,
          createdAt: structuredEmails.createdAt,
          isRead: structuredEmails.isRead,
          readAt: structuredEmails.readAt,
          isArchived: structuredEmails.isArchived,
          threadId: structuredEmails.threadId,
        })
        .from(structuredEmails)
        .where(type === "all"
          ? and(eq(structuredEmails.userId, userId), inArray(structuredEmails.id, receivedIds))
          : and(...receivedConditions))
        .orderBy(desc(structuredEmails.createdAt))
        .limit(limit)
        .offset(type === "all" ? 0 : offset);

      for (const email of receivedEmails) {
        const attachments = parseJsonField(email.attachments, []);
        const fromParsed = parseFromData(email.fromData);

        let preview: string | null = null;
        if (email.textBody) {
          preview = email.textBody.substring(0, 200).replace(/\n/g, " ").trim();
          if (email.textBody.length > 200) {
            preview += "...";
          }
        }

        emails.push({
          id: email.id,
          type: "received",
          envelope_recipient: email.recipient,
          message_id: email.messageId,
          from: fromParsed.address,
          from_name: fromParsed.name,
          to: parseAddressesFromData(email.toData),
          cc: parseAddressesFromData(email.ccData),
          subject: email.subject || "No Subject",
          preview,
          status: email.parseSuccess ? "delivered" : "failed",
          created_at: email.createdAt?.toISOString() || (type === "all" ? fallbackCreatedAt : new Date().toISOString()),
          sent_at: null,
          scheduled_at: null,
          has_attachments: attachments.length > 0,
          attachment_count: attachments.length,
          is_read: email.isRead || false,
          read_at: email.readAt?.toISOString() || null,
          is_archived: email.isArchived || false,
          thread_id: email.threadId,
        });
      }

      if (type === "received") {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(structuredEmails)
          .where(and(...receivedConditions));
        total = Number(count);
      }
    }

    if (includeSent && (type !== "all" || sentIds.length > 0)) {
      const sentEmailsList = await db
        .select({
          id: sentEmails.id,
          messageId: sentEmails.messageId,
          from: sentEmails.from,
          to: sentEmails.to,
          cc: sentEmails.cc,
          subject: sentEmails.subject,
          textBody: sentEmails.textBody,
          attachments: sentEmails.attachments,
          status: sentEmails.status,
          createdAt: sentEmails.createdAt,
          sentAt: sentEmails.sentAt,
          threadId: sentEmails.threadId,
        })
        .from(sentEmails)
        .where(type === "all"
          ? and(eq(sentEmails.userId, userId), inArray(sentEmails.id, sentIds))
          : and(...sentConditions))
        .orderBy(desc(sentEmails.createdAt))
        .limit(limit)
        .offset(type === "all" ? 0 : offset);

      for (const email of sentEmailsList) {
        const attachments = parseJsonField(email.attachments, []);
        const toAddresses = parseJsonField(email.to, []);
        const ccAddresses = parseJsonField(email.cc, []);

        let preview: string | null = null;
        if (email.textBody) {
          preview = email.textBody.substring(0, 200).replace(/\n/g, " ").trim();
          if (email.textBody.length > 200) {
            preview += "...";
          }
        }

        emails.push({
          id: email.id,
          type: "sent",
          message_id: email.messageId,
          from: email.from,
          from_name: null,
          to: toAddresses,
          cc: ccAddresses,
          subject: email.subject || "No Subject",
          preview,
          status: email.status === "sent" ? "delivered" : email.status,
          created_at: email.createdAt?.toISOString() || (type === "all" ? fallbackCreatedAt : new Date().toISOString()),
          sent_at: email.sentAt?.toISOString() || null,
          scheduled_at: null,
          has_attachments: attachments.length > 0,
          attachment_count: attachments.length,
          thread_id: email.threadId,
        });
      }

      if (type === "sent") {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(sentEmails)
          .where(and(...sentConditions));
        total = Number(count);
      }
    }

    if (includeScheduled && (type !== "all" || scheduledIds.length > 0)) {
      const scheduledEmailsList = await db
        .select({
          id: scheduledEmails.id,
          fromAddress: scheduledEmails.fromAddress,
          toAddresses: scheduledEmails.toAddresses,
          subject: scheduledEmails.subject,
          status: scheduledEmails.status,
          createdAt: scheduledEmails.createdAt,
          sentAt: scheduledEmails.sentAt,
          scheduledAt: scheduledEmails.scheduledAt,
          attachments: scheduledEmails.attachments,
        })
        .from(scheduledEmails)
        .where(type === "all"
          ? and(eq(scheduledEmails.userId, userId), inArray(scheduledEmails.id, scheduledIds))
          : and(...scheduledConditions))
        .orderBy(desc(scheduledEmails.createdAt))
        .limit(limit)
        .offset(type === "all" ? 0 : offset);

      for (const email of scheduledEmailsList) {
        const attachments = parseJsonField(email.attachments, []);
        const toAddresses = parseJsonField(email.toAddresses, []);

        emails.push({
          id: email.id,
          type: "scheduled",
          message_id: null,
          from: email.fromAddress,
          from_name: null,
          to: toAddresses,
          cc: [],
          subject: email.subject || "No Subject",
          preview: null,
          status: email.status,
          created_at: email.createdAt?.toISOString() || (type === "all" ? fallbackCreatedAt : new Date().toISOString()),
          sent_at: email.sentAt?.toISOString() || null,
          scheduled_at: email.scheduledAt?.toISOString() || null,
          has_attachments: attachments.length > 0,
          attachment_count: attachments.length,
        });
      }

      if (type === "scheduled") {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(scheduledEmails)
          .where(and(...scheduledConditions));
        total = Number(count);
      }
    }

    if (type === "all") {
      const typeNames = ["received", "sent", "scheduled"];
      const emailsById = new Map(emails.map((email) => [
        `${email.type}:${email.id}`, email,
      ]));
      emails = page.flatMap(({ id, typeOrder }) => {
        const email = emailsById.get(`${typeNames[typeOrder]}:${id}`);
        return email ? [email] : [];
      });
    }

    console.log(
      `✅ Successfully retrieved ${emails.length} emails (total: ${total})`
    );

    return {
      data: emails,
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + emails.length < total,
      },
      filters: {
        type,
        status: status !== "all" ? status : undefined,
        time_range: timeRange,
        search: searchQuery || undefined,
        domain: resolvedDomain || undefined,
        address: resolvedAddress || undefined,
      },
    };
  },
  {
    query: ListEmailsQuerySchema,
    response: {
      200: ListEmailsResponse,
      400: ListEmailsErrorResponse,
      401: ListEmailsErrorResponse,
      500: ListEmailsErrorResponse,
    },
    detail: {
      tags: ["Emails"],
      summary: "List all emails",
      description: "List all email activity (sent, received, and scheduled) with comprehensive filtering options.",
    },
  }
);
