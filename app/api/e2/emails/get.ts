import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import { sentEmails, structuredEmails, scheduledEmails } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Response schemas
const EmailDetailSchema = t.Object({
  object: t.Literal("email"),
  id: t.String(),
  type: t.Union([
    t.Literal("sent"),
    t.Literal("received"),
    t.Literal("scheduled"),
  ]),
  from: t.String(),
  to: t.Array(t.String()),
  envelope_recipient: t.Optional(
    t.Nullable(t.String({ description: "Stored delivery recipient for received emails, independent of message headers" }))
  ),
  cc: t.Optional(t.Nullable(t.Array(t.String()))),
  bcc: t.Optional(t.Nullable(t.Array(t.String()))),
  reply_to: t.Optional(t.Nullable(t.Array(t.String()))),
  subject: t.String(),
  html: t.Optional(t.Nullable(t.String())),
  text: t.Optional(t.Nullable(t.String())),
  status: t.String(),
  created_at: t.String(),
  sent_at: t.Optional(t.Nullable(t.String())),
  scheduled_at: t.Optional(t.Nullable(t.String())),
  has_attachments: t.Boolean(),
  attachments: t.Optional(t.Array(t.Any({ "x-stainless-any": true }))),
  is_read: t.Optional(t.Boolean()),
  thread_id: t.Optional(t.Nullable(t.String())),
  thread_position: t.Optional(t.Nullable(t.Number())),
  headers: t.Optional(t.Any({ "x-stainless-any": true })),
  tags: t.Optional(t.Array(t.Any({ "x-stainless-any": true }))),
});

const GetEmailErrorResponse = t.Object({
  error: t.String(),
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

function parseFromData(field: string | null): string {
  if (!field) return "unknown";
  try {
    const parsed = JSON.parse(field);
    return parsed?.addresses?.[0]?.address || parsed?.text || "unknown";
  } catch {
    return "unknown";
  }
}

function parseAddressesFromData(field: string | null): string[] {
  if (!field) return [];
  try {
    const parsed = JSON.parse(field);
    return parsed?.addresses?.map((a: any) => a.address).filter(Boolean) || [];
  } catch {
    return [];
  }
}

export const getEmail = new Elysia().get(
  "/emails/:id",
  async ({ request, params, set }) => {
    console.log("📧 GET /api/e2/emails/:id - Starting request for:", params.id);

    // Auth & rate limit validation
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    const emailId = params.id;

    // Try to find in received emails (structuredEmails) first
    console.log("🔍 Searching received emails...");
    const receivedEmail = await db
      .select()
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.id, emailId),
          eq(structuredEmails.userId, userId)
        )
      )
      .limit(1);

    if (receivedEmail.length > 0) {
      const email = receivedEmail[0];
      console.log("✅ Found in received emails");

      const attachments = parseJsonField(email.attachments, []);

      return {
        object: "email" as const,
        id: email.id,
        type: "received" as const,
        envelope_recipient: email.recipient,
        from: parseFromData(email.fromData),
        to: parseAddressesFromData(email.toData),
        cc: parseAddressesFromData(email.ccData),
        bcc: parseAddressesFromData(email.bccData),
        reply_to: parseAddressesFromData(email.replyToData),
        subject: email.subject || "No Subject",
        html: email.htmlBody,
        text: email.textBody,
        status: email.parseSuccess ? "delivered" : "failed",
        created_at: email.createdAt?.toISOString() || new Date().toISOString(),
        sent_at: null,
        scheduled_at: null,
        has_attachments: attachments.length > 0,
        attachments,
        is_read: email.isRead || false,
        thread_id: email.threadId,
        thread_position: email.threadPosition,
        headers: parseJsonField(email.headers, {}),
      };
    }

    // Try to find in sent emails
    console.log("🔍 Searching sent emails...");
    const sentEmail = await db
      .select()
      .from(sentEmails)
      .where(and(eq(sentEmails.id, emailId), eq(sentEmails.userId, userId)))
      .limit(1);

    if (sentEmail.length > 0) {
      const email = sentEmail[0];
      console.log("✅ Found in sent emails");

      const attachments = parseJsonField(email.attachments, []);
      const tags = parseJsonField(email.tags, []);

      return {
        object: "email" as const,
        id: email.id,
        type: "sent" as const,
        from: email.from,
        to: parseJsonField(email.to, []),
        cc: parseJsonField(email.cc, null),
        bcc: parseJsonField(email.bcc, null),
        reply_to: parseJsonField(email.replyTo, null),
        subject: email.subject,
        html: email.htmlBody,
        text: email.textBody,
        status: email.status === "sent" ? "delivered" : email.status,
        created_at: email.createdAt?.toISOString() || new Date().toISOString(),
        sent_at: email.sentAt?.toISOString() || null,
        scheduled_at: null,
        has_attachments: attachments.length > 0,
        attachments,
        thread_id: email.threadId,
        thread_position: email.threadPosition,
        headers: parseJsonField(email.headers, {}),
        tags,
      };
    }

    // Try to find in scheduled emails
    console.log("🔍 Searching scheduled emails...");
    const scheduledEmail = await db
      .select()
      .from(scheduledEmails)
      .where(
        and(eq(scheduledEmails.id, emailId), eq(scheduledEmails.userId, userId))
      )
      .limit(1);

    if (scheduledEmail.length > 0) {
      const email = scheduledEmail[0];
      console.log("✅ Found in scheduled emails");

      const attachments = parseJsonField(email.attachments, []);
      const tags = parseJsonField(email.tags, []);

      return {
        object: "email" as const,
        id: email.id,
        type: "scheduled" as const,
        from: email.fromAddress,
        to: parseJsonField(email.toAddresses, []),
        cc: parseJsonField(email.ccAddresses, null),
        bcc: parseJsonField(email.bccAddresses, null),
        reply_to: parseJsonField(email.replyToAddresses, null),
        subject: email.subject,
        html: email.htmlBody,
        text: email.textBody,
        status: email.status,
        created_at: email.createdAt?.toISOString() || new Date().toISOString(),
        sent_at: email.sentAt?.toISOString() || null,
        scheduled_at: email.scheduledAt?.toISOString() || null,
        has_attachments: attachments.length > 0,
        attachments,
        headers: parseJsonField(email.headers, {}),
        tags,
      };
    }

    // Email not found
    console.log("❌ Email not found:", emailId);
    set.status = 404;
    return { error: "Email not found" };
  },
  {
    params: t.Object({
      id: t.String(),
    }),
    response: {
      200: EmailDetailSchema,
      401: GetEmailErrorResponse,
      404: GetEmailErrorResponse,
      500: GetEmailErrorResponse,
    },
    detail: {
      tags: ["Emails"],
      summary: "Get email by ID",
      description:
        "Retrieve a single email by ID. Works for sent, received, and scheduled emails.",
    },
  }
);
