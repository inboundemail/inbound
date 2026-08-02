import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import {
  emailAddresses,
  emailDomains,
  emailThreads,
  sentEmails,
  structuredEmails,
} from "@/lib/db/schema";
import {
  getInboundOAuthSessionForRequest,
  inboundOAuthRequestAllowsDomain,
  validateAndRateLimit,
} from "../lib/auth";
import { getThreadParticipantNames } from "../lib/participants";

// Query parameters schema with full OpenAPI descriptions
const ListThreadsQuerySchema = t.Object({
  domain: t.Optional(
    t.String({
      description:
        "Filter threads by domain. Accepts domain ID (e.g., 'dom_xxx') or domain name (e.g., 'example.com'). Returns threads where any participant email matches the domain.",
    })
  ),
  address: t.Optional(
    t.String({
      description:
        "Filter threads by email address. Accepts address ID (e.g., 'addr_xxx') or raw email address (e.g., 'user@example.com'). Returns threads where the address is a participant.",
    })
  ),
  limit: t.Optional(
    t.String({
      description:
        "Maximum number of threads to return (1-100). Default is 25.",
      default: "25",
    })
  ),
  cursor: t.Optional(
    t.String({
      description:
        "Cursor for pagination. Pass the thread ID from `pagination.next_cursor` of the previous response to get the next page.",
    })
  ),
  search: t.Optional(
    t.String({
      description:
        "Search query to filter threads by subject or participant emails. Case-insensitive partial match.",
    })
  ),
  unread: t.Optional(
    t.String({
      description:
        "Filter by unread status. Set to 'true' to only return threads with unread messages.",
      default: "false",
    })
  ),
});

// Latest message schema with full descriptions
const LatestMessageSchema = t.Object({
  id: t.String({ description: "Unique identifier of the message" }),
  type: t.Union([t.Literal("inbound"), t.Literal("outbound")], {
    description:
      "Whether the message was received (inbound) or sent (outbound)",
  }),
  subject: t.Optional(
    t.Nullable(t.String({ description: "Subject line of the message" }))
  ),
  from_text: t.String({
    description: "Formatted sender information (name and/or email)",
  }),
  text_preview: t.Optional(
    t.Nullable(
      t.String({
        description: "First 200 characters of the message body as a preview",
      })
    )
  ),
  is_read: t.Boolean({
    description: "Whether the message has been read (always true for outbound)",
  }),
  has_attachments: t.Boolean({
    description: "Whether the message has any attachments",
  }),
  date: t.Optional(
    t.Nullable(
      t.String({
        description: "ISO 8601 timestamp of when the message was sent/received",
      })
    )
  ),
});

// Thread item schema with full descriptions
const ThreadItemSchema = t.Object({
  id: t.String({ description: "Unique identifier for the thread" }),
  root_message_id: t.String({
    description: "RFC 2822 Message-ID of the first message in the thread",
  }),
  normalized_subject: t.Optional(
    t.Nullable(
      t.String({
        description:
          "Normalized subject line (stripped of Re:, Fwd:, etc.) used for thread grouping",
      })
    )
  ),
  participant_emails: t.Array(t.String(), {
    description:
      "Array of all unique email addresses that have participated in this thread",
  }),
  participant_names: t.Array(t.String(), {
    description:
      "Array of formatted participant names in the format 'First Last <email@domain.com>' or just 'email@domain.com' if no name is available",
  }),
  message_count: t.Number({
    description:
      "Total number of messages in the thread (both inbound and outbound)",
  }),
  last_message_at: t.String({
    description: "ISO 8601 timestamp of the most recent message in the thread",
  }),
  created_at: t.String({
    description:
      "ISO 8601 timestamp when the thread was created (first message received)",
  }),
  latest_message: t.Optional(t.Nullable(LatestMessageSchema)),
  has_unread: t.Boolean({
    description: "Whether the thread has any unread inbound messages",
  }),
  is_archived: t.Boolean({
    description: "Whether the thread has been archived",
  }),
  unread_count: t.Optional(
    t.Number({
      description: "Number of unread messages in the thread",
    })
  ),
});

// Response schemas with full descriptions
const ListThreadsResponse = t.Object({
  threads: t.Array(ThreadItemSchema, {
    description:
      "Array of thread objects matching the query, sorted by last message date (newest first)",
  }),
  pagination: t.Object(
    {
      limit: t.Number({ description: "Number of results per page" }),
      has_more: t.Boolean({
        description: "Whether there are more threads available after this page",
      }),
      next_cursor: t.Optional(
        t.Nullable(
          t.String({
            description:
              "Cursor to pass as the `cursor` parameter to fetch the next page. Null if no more results.",
          })
        )
      ),
    },
    { description: "Pagination metadata for cursor-based pagination" }
  ),
  filters: t.Object(
    {
      search: t.Optional(t.String({ description: "Applied search query" })),
      unread_only: t.Optional(
        t.Boolean({ description: "Whether filtering for unread threads only" })
      ),
      domain: t.Optional(
        t.String({
          description: "Applied domain filter (resolved domain name)",
        })
      ),
      address: t.Optional(
        t.String({
          description: "Applied address filter (resolved email address)",
        })
      ),
    },
    { description: "Applied filters for this query" }
  ),
});

const ListThreadsErrorResponse = t.Object({
  error: t.String({ description: "Error message describing what went wrong" }),
});

// Helper to get latest message for a thread
async function getLatestMessageForThread(threadId: string, userId: string) {
  // Get latest inbound message
  const latestInbound = await db
    .select({
      id: structuredEmails.id,
      subject: structuredEmails.subject,
      fromData: structuredEmails.fromData,
      textBody: structuredEmails.textBody,
      isRead: structuredEmails.isRead,
      attachments: structuredEmails.attachments,
      date: structuredEmails.date,
      threadPosition: structuredEmails.threadPosition,
    })
    .from(structuredEmails)
    .where(
      and(
        eq(structuredEmails.threadId, threadId),
        eq(structuredEmails.userId, userId)
      )
    )
    .orderBy(desc(structuredEmails.threadPosition))
    .limit(1);

  // Get latest outbound message
  const latestOutbound = await db
    .select({
      id: sentEmails.id,
      subject: sentEmails.subject,
      from: sentEmails.from,
      textBody: sentEmails.textBody,
      attachments: sentEmails.attachments,
      sentAt: sentEmails.sentAt,
      threadPosition: sentEmails.threadPosition,
    })
    .from(sentEmails)
    .where(
      and(eq(sentEmails.threadId, threadId), eq(sentEmails.userId, userId))
    )
    .orderBy(desc(sentEmails.threadPosition))
    .limit(1);

  const inbound = latestInbound[0];
  const outbound = latestOutbound[0];

  if (!inbound && !outbound) return null;

  const inboundPosition = inbound?.threadPosition || 0;
  const outboundPosition = outbound?.threadPosition || 0;

  if (outboundPosition > inboundPosition && outbound) {
    let attachments: any[] = [];
    try {
      attachments = outbound.attachments
        ? JSON.parse(outbound.attachments)
        : [];
    } catch (e) {}

    return {
      id: outbound.id,
      type: "outbound" as const,
      subject: outbound.subject,
      from_text: outbound.from,
      text_preview: outbound.textBody
        ? outbound.textBody.substring(0, 200)
        : null,
      is_read: true,
      has_attachments: attachments.length > 0,
      date: outbound.sentAt?.toISOString() || null,
    };
  } else if (inbound) {
    let fromText = "Unknown Sender";
    try {
      if (inbound.fromData) {
        const fromParsed = JSON.parse(inbound.fromData);
        fromText =
          fromParsed.text ||
          fromParsed.addresses?.[0]?.address ||
          "Unknown Sender";
      }
    } catch (e) {}

    let attachments: any[] = [];
    try {
      attachments = inbound.attachments ? JSON.parse(inbound.attachments) : [];
    } catch (e) {}

    return {
      id: inbound.id,
      type: "inbound" as const,
      subject: inbound.subject,
      from_text: fromText,
      text_preview: inbound.textBody
        ? inbound.textBody.substring(0, 200)
        : null,
      is_read: inbound.isRead || false,
      has_attachments: attachments.length > 0,
      date: inbound.date?.toISOString() || null,
    };
  }

  return null;
}

// Get unread count for a thread
async function getThreadUnreadCount(
  threadId: string,
  userId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(structuredEmails)
    .where(
      and(
        eq(structuredEmails.threadId, threadId),
        eq(structuredEmails.userId, userId),
        eq(structuredEmails.isRead, false)
      )
    );

  return Number(result[0]?.count || 0);
}

export const listThreads = new Elysia().get(
  "/mail/threads",
  async ({ request, query, set }) => {
    console.log("🧵 GET /api/e2/mail/threads - Starting request");

    // Auth & rate limit validation
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    // Parse query parameters
    const limit = Math.min(parseInt(query.limit || "25"), 100);
    const cursor = query.cursor;
    const search = query.search?.trim();
    const unreadOnly = query.unread === "true";
    const domainFilter = query.domain;
    const addressFilter = query.address;
    const oauthSession = getInboundOAuthSessionForRequest(request);

    if (oauthSession && !domainFilter && !addressFilter) {
      set.status = 403;
      return {
        error:
          "A domain or address filter is required for a domain-scoped OAuth session",
      };
    }

    console.log("📋 Query params:", {
      limit,
      cursor,
      search,
      unreadOnly,
      domainFilter,
      addressFilter,
    });

    // Validate limit
    if (limit < 1 || limit > 100) {
      set.status = 400;
      return { error: "Limit must be between 1 and 100" };
    }

    // Build the base query conditions
    const conditions: any[] = [eq(emailThreads.userId, userId)];

    // Resolve and apply domain filter
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
      if (!inboundOAuthRequestAllowsDomain(request, resolvedDomain)) {
        set.status = 403;
        return { error: "This OAuth session cannot access that domain" };
      }
      conditions.push(
        like(emailThreads.participantEmails, `%@${resolvedDomain}%`)
      );
    }

    // Resolve and apply address filter
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
      if (!inboundOAuthRequestAllowsDomain(request, resolvedAddress)) {
        set.status = 403;
        return { error: "This OAuth session cannot access that address" };
      }
      conditions.push(
        like(emailThreads.participantEmails, `%${resolvedAddress}%`)
      );
    }

    // Add search condition
    if (search) {
      conditions.push(
        or(
          like(emailThreads.normalizedSubject, `%${search.toLowerCase()}%`),
          like(emailThreads.participantEmails, `%${search.toLowerCase()}%`)
        )
      );
    }

    // Cursor-based pagination
    if (cursor) {
      const cursorThread = await db
        .select({ lastMessageAt: emailThreads.lastMessageAt })
        .from(emailThreads)
        .where(eq(emailThreads.id, cursor))
        .limit(1);

      if (cursorThread.length > 0 && cursorThread[0].lastMessageAt) {
        conditions.push(
          sql`${emailThreads.lastMessageAt} < ${cursorThread[0].lastMessageAt}`
        );
      }
    }

    const whereCondition =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    // Build response with latest message previews
    const threadItems: any[] = [];
    let hasMore = false;

    // When unreadOnly is true, we need to fetch more threads since some will be filtered out
    // Fetch in batches until we have enough threads or run out of results
    const batchSize = unreadOnly ? Math.max(limit * 3, 50) : limit + 1;
    let currentCursor = cursor;
    let totalFetched = 0;
    const maxIterations = 10; // Safety limit to prevent infinite loops
    let iterations = 0;

    while (threadItems.length < limit && iterations < maxIterations) {
      iterations++;

      // Build cursor condition for this batch
      const batchConditions = [...conditions];
      if (currentCursor && iterations > 1) {
        const cursorThread = await db
          .select({ lastMessageAt: emailThreads.lastMessageAt })
          .from(emailThreads)
          .where(eq(emailThreads.id, currentCursor))
          .limit(1);

        if (cursorThread.length > 0 && cursorThread[0].lastMessageAt) {
          batchConditions.push(
            sql`${emailThreads.lastMessageAt} < ${cursorThread[0].lastMessageAt}`
          );
        }
      }

      const batchWhereCondition =
        batchConditions.length > 1
          ? and(...batchConditions)
          : batchConditions[0];

      // Get threads batch
      const threads = await db
        .select({
          id: emailThreads.id,
          rootMessageId: emailThreads.rootMessageId,
          normalizedSubject: emailThreads.normalizedSubject,
          participantEmails: emailThreads.participantEmails,
          messageCount: emailThreads.messageCount,
          lastMessageAt: emailThreads.lastMessageAt,
          createdAt: emailThreads.createdAt,
        })
        .from(emailThreads)
        .where(batchWhereCondition)
        .orderBy(desc(emailThreads.lastMessageAt))
        .limit(batchSize);

      totalFetched += threads.length;
      console.log(
        `📊 Batch ${iterations}: Found ${threads.length} threads (total fetched: ${totalFetched})`
      );

      // No more threads available
      if (threads.length === 0) {
        hasMore = false;
        break;
      }

      // Process threads
      for (const thread of threads) {
        if (threadItems.length >= limit) {
          hasMore = true;
          break;
        }

        const latestMessage = await getLatestMessageForThread(
          thread.id,
          userId
        );
        const unreadCount = await getThreadUnreadCount(thread.id, userId);
        const hasUnread = unreadCount > 0;

        // Apply unread filter
        if (unreadOnly && !hasUnread) {
          continue;
        }

        // Parse participant emails
        let participantEmails: string[] = [];
        try {
          participantEmails = thread.participantEmails
            ? JSON.parse(thread.participantEmails)
            : [];
        } catch (e) {
          console.error("Failed to parse participant emails:", e);
        }

        // Get formatted participant names (e.g., "First Last <email@domain.com>")
        const participantNames = await getThreadParticipantNames(
          thread.id,
          userId
        );

        threadItems.push({
          id: thread.id,
          root_message_id: thread.rootMessageId,
          normalized_subject: thread.normalizedSubject,
          participant_emails: participantEmails,
          participant_names: participantNames,
          message_count: thread.messageCount || 0,
          last_message_at:
            thread.lastMessageAt?.toISOString() || new Date().toISOString(),
          created_at:
            thread.createdAt?.toISOString() || new Date().toISOString(),
          latest_message: latestMessage,
          has_unread: hasUnread,
          unread_count: unreadCount,
          is_archived: false, // TODO: Implement archiving
        });
      }

      // If we got fewer threads than batch size, there are no more
      if (threads.length < batchSize) {
        hasMore = threadItems.length >= limit && threads.length === batchSize;
        break;
      }

      // Update cursor for next batch
      currentCursor = threads[threads.length - 1].id;
    }

    // Determine next cursor based on the last thread we actually returned
    const nextCursor =
      hasMore && threadItems.length > 0
        ? threadItems[threadItems.length - 1].id
        : null;

    console.log(`✅ Successfully retrieved ${threadItems.length} threads`);

    return {
      threads: threadItems,
      pagination: {
        limit,
        has_more: hasMore,
        next_cursor: nextCursor,
      },
      filters: {
        search: search || undefined,
        unread_only: unreadOnly || undefined,
        domain: resolvedDomain || undefined,
        address: resolvedAddress || undefined,
      },
    };
  },
  {
    query: ListThreadsQuerySchema,
    response: {
      200: ListThreadsResponse,
      400: ListThreadsErrorResponse,
      401: ListThreadsErrorResponse,
      403: ListThreadsErrorResponse,
      500: ListThreadsErrorResponse,
    },
    detail: {
      tags: ["Inbox"],
      summary: "List inbox threads",
      description: `List email threads (conversations) for your inbox with cursor-based pagination. This is the primary endpoint for building an inbox UI.

**What is a Thread?**
A thread groups related emails together based on the In-Reply-To and References headers, similar to how Gmail groups conversations. Each thread contains both inbound (received) and outbound (sent) messages.

**Use with /mail/threads/:id:**
Use this endpoint to list threads, then use \`GET /mail/threads/:id\` to fetch all messages in a specific thread.`,
    },
  }
);
