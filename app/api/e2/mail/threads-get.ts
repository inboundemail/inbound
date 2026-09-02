import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { getThreadParticipantNames } from "../lib/participants";
import { db } from "@/lib/db";
import { emailThreads, structuredEmails, sentEmails } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

// Attachment schema
const AttachmentSchema = t.Object({
  filename: t.Optional(
    t.String({ description: "Original filename of the attachment" })
  ),
  contentType: t.Optional(
    t.String({ description: "MIME type of the attachment" })
  ),
  size: t.Optional(
    t.Number({ description: "Size of the attachment in bytes" })
  ),
  contentId: t.Optional(
    t.Nullable(t.String({ description: "Content-ID for inline attachments" }))
  ),
  content: t.Optional(
    t.String({ description: "Base64-encoded content (if included)" })
  ),
});

// Tag schema for sent emails
const TagSchema = t.Object({
  name: t.String({ description: "Tag name" }),
  value: t.String({ description: "Tag value" }),
});

// Thread message schema with full OpenAPI descriptions
const ThreadMessageSchema = t.Object({
  id: t.String({ description: "Unique identifier for the message" }),
  message_id: t.Optional(
    t.Nullable(t.String({ description: "RFC 2822 Message-ID header value" }))
  ),
  type: t.Union([t.Literal("inbound"), t.Literal("outbound")], {
    description:
      "Whether the message was received (inbound) or sent (outbound)",
  }),
  thread_position: t.Number({
    description: "Position of the message in the thread (0 = first message)",
  }),

  // Message content
  subject: t.Optional(
    t.Nullable(t.String({ description: "Subject line of the message" }))
  ),
  text_body: t.Optional(
    t.Nullable(t.String({ description: "Plain text body of the message" }))
  ),
  html_body: t.Optional(
    t.Nullable(t.String({ description: "HTML body of the message" }))
  ),

  // Sender/recipient info
  from: t.String({ description: "Formatted sender (display name and email)" }),
  from_name: t.Optional(
    t.Nullable(t.String({ description: "Sender display name if available" }))
  ),
  from_address: t.Optional(
    t.Nullable(t.String({ description: "Sender email address" }))
  ),
  to: t.Array(t.String(), {
    description: "Array of recipient email addresses",
  }),
  envelope_recipient: t.Optional(
    t.Nullable(t.String({ description: "Stored delivery recipient for inbound messages, independent of message headers" }))
  ),
  cc: t.Array(t.String(), {
    description: "Array of CC recipient email addresses",
  }),
  bcc: t.Array(t.String(), {
    description: "Array of BCC recipient email addresses",
  }),

  // Timestamps
  date: t.Optional(
    t.Nullable(
      t.String({ description: "ISO 8601 timestamp from the Date header" })
    )
  ),
  received_at: t.Optional(
    t.Nullable(
      t.String({
        description:
          "ISO 8601 timestamp when the message was received (inbound only)",
      })
    )
  ),
  sent_at: t.Optional(
    t.Nullable(
      t.String({
        description:
          "ISO 8601 timestamp when the message was sent (outbound only)",
      })
    )
  ),

  // Message metadata
  is_read: t.Boolean({
    description: "Whether the message has been read (always true for outbound)",
  }),
  read_at: t.Optional(
    t.Nullable(
      t.String({
        description: "ISO 8601 timestamp when the message was marked as read",
      })
    )
  ),
  has_attachments: t.Boolean({
    description: "Whether the message has any attachments",
  }),
  attachments: t.Array(AttachmentSchema, {
    description: "Array of attachment metadata",
  }),

  // Threading metadata
  in_reply_to: t.Optional(
    t.Nullable(t.String({ description: "RFC 2822 In-Reply-To header value" }))
  ),
  references: t.Array(t.String(), {
    description: "Array of Message-IDs from the References header",
  }),

  // Headers and tags
  headers: t.Any({
    "x-stainless-any": true,
    description: "Raw email headers as key-value pairs",
  }),
  tags: t.Array(TagSchema, {
    description: "Array of tags attached to the message (outbound only)",
  }),

  // Status (for sent emails)
  status: t.Optional(
    t.String({
      description:
        "Delivery status for outbound messages (pending, sent, failed, bounced)",
    })
  ),
  failure_reason: t.Optional(
    t.Nullable(
      t.String({
        description: "Error message if the outbound message failed to send",
      })
    )
  ),
});

// Thread details schema with full descriptions
const ThreadDetailsSchema = t.Object({
  id: t.String({ description: "Unique identifier for the thread" }),
  root_message_id: t.String({
    description: "RFC 2822 Message-ID of the first message in the thread",
  }),
  normalized_subject: t.Optional(
    t.Nullable(
      t.String({
        description: "Normalized subject line (stripped of Re:, Fwd:, etc.)",
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
    description: "Total number of messages in the thread",
  }),
  last_message_at: t.String({
    description: "ISO 8601 timestamp of the most recent message",
  }),
  created_at: t.String({
    description: "ISO 8601 timestamp when the thread was created",
  }),
  updated_at: t.String({
    description: "ISO 8601 timestamp when the thread was last updated",
  }),
});

// Response schemas
const GetThreadResponse = t.Object({
  thread: ThreadDetailsSchema,
  messages: t.Array(ThreadMessageSchema, {
    description:
      "Array of all messages in the thread, sorted by thread position (chronological)",
  }),
  total_count: t.Number({
    description: "Total number of messages returned",
  }),
});

const GetThreadErrorResponse = t.Object({
  error: t.String({ description: "Error message describing what went wrong" }),
});

// Helper to extract email addresses from parsed email data
function extractEmailAddresses(emailData: string | null): string[] {
  if (!emailData) return [];

  try {
    const parsed = JSON.parse(emailData);
    if (parsed?.addresses && Array.isArray(parsed.addresses)) {
      return parsed.addresses
        .map((addr: any) => addr.address)
        .filter((email: string) => email && typeof email === "string");
    }
  } catch (e) {
    // Ignore parsing errors
  }

  return [];
}

export const getThread = new Elysia().get(
  "/mail/threads/:id",
  async ({ request, params, set }) => {
    console.log("🧵 GET /api/e2/mail/threads/:id - Starting request");

    // Auth & rate limit validation
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    const threadId = params.id;
    console.log("🧵 Requested thread ID:", threadId);

    // Validate thread ID
    if (!threadId || typeof threadId !== "string") {
      console.log("⚠️ Invalid thread ID provided:", threadId);
      set.status = 400;
      return { error: "Valid thread ID is required" };
    }

    // Get thread info
    console.log("🔍 Fetching thread details");
    const thread = await db
      .select()
      .from(emailThreads)
      .where(
        and(eq(emailThreads.id, threadId), eq(emailThreads.userId, userId))
      )
      .limit(1);

    if (thread.length === 0) {
      console.log("📭 Thread not found");
      set.status = 404;
      return { error: "Thread not found" };
    }

    const threadDetails = thread[0];
    console.log(`📊 Thread found: ${threadDetails.messageCount} messages`);

    // Get all inbound messages in the thread
    console.log("📥 Fetching inbound messages");
    const inboundMessages = await db
      .select()
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.threadId, threadId),
          eq(structuredEmails.userId, userId)
        )
      )
      .orderBy(asc(structuredEmails.threadPosition));

    // Get all outbound messages in the thread
    console.log("📤 Fetching outbound messages");
    const outboundMessages = await db
      .select()
      .from(sentEmails)
      .where(
        and(eq(sentEmails.threadId, threadId), eq(sentEmails.userId, userId))
      )
      .orderBy(asc(sentEmails.threadPosition));

    console.log(
      `📊 Found ${inboundMessages.length} inbound and ${outboundMessages.length} outbound messages`
    );

    // Convert to unified message format
    const messages: any[] = [];

    // Process inbound messages
    for (const email of inboundMessages) {
      let fromData = null;
      let attachments: any[] = [];
      let references: string[] = [];
      let headers: Record<string, any> = {};

      try {
        fromData = email.fromData ? JSON.parse(email.fromData) : null;
        attachments = email.attachments ? JSON.parse(email.attachments) : [];
        references = email.references ? JSON.parse(email.references) : [];
        headers = email.headers ? JSON.parse(email.headers) : {};
      } catch (e) {
        console.error("Failed to parse inbound email data:", e);
      }

      messages.push({
        id: email.id,
        message_id: email.messageId,
        type: "inbound" as const,
        envelope_recipient: email.recipient,
        thread_position: email.threadPosition || 0,

        // Content
        subject: email.subject,
        text_body: email.textBody,
        html_body: email.htmlBody,

        // Sender/recipient info
        from: fromData?.text || "Unknown Sender",
        from_name: fromData?.addresses?.[0]?.name || null,
        from_address: fromData?.addresses?.[0]?.address || null,
        to: extractEmailAddresses(email.toData),
        cc: extractEmailAddresses(email.ccData),
        bcc: extractEmailAddresses(email.bccData),

        // Timestamps
        date: email.date?.toISOString() || null,
        received_at: email.createdAt?.toISOString() || null,
        sent_at: null,

        // Message metadata
        is_read: email.isRead || false,
        read_at: email.readAt?.toISOString() || null,
        has_attachments: attachments.length > 0,
        attachments: attachments,

        // Threading metadata
        in_reply_to: email.inReplyTo,
        references: references,

        // Headers and tags
        headers: headers,
        tags: [],
      });
    }

    // Process outbound messages
    for (const email of outboundMessages) {
      let toAddresses: string[] = [];
      let ccAddresses: string[] = [];
      let bccAddresses: string[] = [];
      let headers: Record<string, any> = {};
      let attachments: any[] = [];
      let tags: Array<{ name: string; value: string }> = [];

      try {
        toAddresses = email.to ? JSON.parse(email.to) : [];
        ccAddresses = email.cc ? JSON.parse(email.cc) : [];
        bccAddresses = email.bcc ? JSON.parse(email.bcc) : [];
        headers = email.headers ? JSON.parse(email.headers) : {};
        attachments = email.attachments ? JSON.parse(email.attachments) : [];
        tags = email.tags ? JSON.parse(email.tags) : [];
      } catch (e) {
        console.error("Failed to parse outbound email data:", e);
      }

      const references: string[] = headers["References"]
        ? typeof headers["References"] === "string"
          ? headers["References"].split(/\s+/).filter(Boolean)
          : []
        : [];

      messages.push({
        id: email.id,
        message_id: email.messageId,
        type: "outbound" as const,
        thread_position: email.threadPosition || 0,

        // Content
        subject: email.subject,
        text_body: email.textBody,
        html_body: email.htmlBody,

        // Sender/recipient info
        from: email.from,
        from_name: null,
        from_address: email.fromAddress,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,

        // Timestamps
        date: email.sentAt?.toISOString() || null,
        received_at: null,
        sent_at: email.sentAt?.toISOString() || null,

        // Message metadata
        is_read: true,
        read_at: email.sentAt?.toISOString() || null,
        has_attachments: attachments.length > 0,
        attachments: attachments,

        // Threading metadata
        in_reply_to: headers["In-Reply-To"] || null,
        references: references,

        // Headers and tags
        headers: headers,
        tags: tags,

        // Status
        status: email.status,
        failure_reason: email.failureReason,
      });
    }

    // Sort messages by thread position
    messages.sort((a, b) => a.thread_position - b.thread_position);

    // Parse participant emails
    let participantEmails: string[] = [];
    try {
      participantEmails = threadDetails.participantEmails
        ? JSON.parse(threadDetails.participantEmails)
        : [];
    } catch (e) {
      console.error("Failed to parse participant emails:", e);
    }

    // Get formatted participant names (e.g., "First Last <email@domain.com>")
    const participantNames = await getThreadParticipantNames(threadId, userId);

    // Build response
    const response = {
      thread: {
        id: threadDetails.id,
        root_message_id: threadDetails.rootMessageId,
        normalized_subject: threadDetails.normalizedSubject,
        participant_emails: participantEmails,
        participant_names: participantNames,
        message_count: threadDetails.messageCount || 0,
        last_message_at:
          threadDetails.lastMessageAt?.toISOString() ||
          new Date().toISOString(),
        created_at:
          threadDetails.createdAt?.toISOString() || new Date().toISOString(),
        updated_at:
          threadDetails.updatedAt?.toISOString() || new Date().toISOString(),
      },
      messages,
      total_count: messages.length,
    };

    console.log(
      `✅ Successfully retrieved thread with ${messages.length} messages`
    );
    return response;
  },
  {
    params: t.Object({
      id: t.String({ description: "The unique thread ID to retrieve" }),
    }),
    response: {
      200: GetThreadResponse,
      400: GetThreadErrorResponse,
      401: GetThreadErrorResponse,
      404: GetThreadErrorResponse,
      500: GetThreadErrorResponse,
    },
    detail: {
      tags: ["Inbox"],
      summary: "Get thread by ID",
      description: `Retrieve a complete email thread (conversation) with all messages.

**What You Get:**
- Thread metadata (subject, participants, timestamps)
- All messages in the thread (both inbound and outbound)
- Messages sorted chronologically by thread position

**Message Types:**
- \`inbound\` - Emails you received
- \`outbound\` - Emails you sent (includes delivery status)
`,
    },
  }
);
