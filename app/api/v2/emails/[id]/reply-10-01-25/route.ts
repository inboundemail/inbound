import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "../../../helper/main";
import {
  processAttachments,
  attachmentsToStorageFormat,
  type AttachmentInput,
} from "../../../helper/attachment-processor";
import { buildRawEmailMessage } from "../../../helper/email-builder";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { db } from "@/lib/db";
import {
  sentEmails,
  emailDomains,
  structuredEmails,
  SENT_EMAIL_STATUS,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { Autumn as autumn } from "autumn-js";
import { nanoid } from "nanoid";
import {
  canUserSendFromEmail,
  extractEmailAddress,
  extractDomain,
  extractEmailName,
} from "@/lib/email-management/agent-email-helper";

/**
 * POST /api/v2/emails/[id]/reply
 * Reply to an inbound email
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/emails/[id]/reply types
export interface PostEmailReplyRequest {
  from: string;
  from_name?: string; // Optional sender name for display
  to?: string | string[]; // Optional - will use original sender if not provided
  subject?: string; // Optional - will add "Re: " to original subject if not provided
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string | string[]; // snake_case (legacy)
  replyTo?: string | string[]; // camelCase (Resend-compatible)
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: AttachmentInput[];
  include_original?: boolean; // snake_case (legacy)
  includeOriginal?: boolean; // camelCase (Resend-compatible)
  simple?: boolean; // Use simplified reply mode (faster, lighter)
  tags?: Array<{
    // Resend-compatible tags
    name: string;
    value: string;
  }>;
}

export interface PostEmailReplyResponse {
  id: string;
  messageId: string; // Inbound message ID (used for threading)
  awsMessageId: string; // AWS SES Message ID
}

// Helper functions
// Helper functions moved to @/lib/email-management/agent-email-helper
function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Format sender name and email address for display
function formatSenderAddress(email: string, name?: string): string {
  if (!name) return email;

  // Escape quotes in name and wrap in quotes if it contains special characters
  const escapedName = name.replace(/"/g, '\\"');
  const needsQuotes = /[,<>()[\]:;@\\"]/.test(name);

  if (needsQuotes) {
    return `"${escapedName}" <${email}>`;
  } else {
    return `${escapedName} <${email}>`;
  }
}

// Format date for email headers
function formatEmailDate(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = days[date.getUTCDay()];
  const dayNum = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");

  return `${day}, ${dayNum} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
}

// Quote the original message for reply - might want to deprecate this
function quoteMessage(
  originalEmail: any,
  includeOriginal: boolean = true
): string {
  if (!includeOriginal) return "";

  // Parse the from data
  let fromData = null;
  if (originalEmail.fromData) {
    try {
      fromData = JSON.parse(originalEmail.fromData);
    } catch (e) {
      console.error("Failed to parse fromData:", e);
    }
  }

  const fromText = fromData?.text || "Unknown Sender";
  const dateStr = originalEmail.date
    ? formatEmailDate(new Date(originalEmail.date))
    : "Unknown Date";

  // Create the quote header in standard email format
  const quoteHeader = `\n\nOn ${dateStr}, ${fromText} wrote:\n`;

  // Quote the original message with > prefix
  const originalText = originalEmail.textBody || "";

  // Split into lines and process each line properly
  const lines = originalText.split("\n");
  const quotedLines = lines.map((line: string) => {
    // If line is empty or only whitespace, keep it empty with just >
    if (line.trim() === "") {
      return ">";
    }

    // If line already starts with '>', add another level of quoting
    if (line.startsWith(">")) {
      return `>${line}`;
    }

    // Otherwise, add single level quote
    return `> ${line}`;
  });

  return quoteHeader + quotedLines.join("\n");
}

// Initialize SES client
const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESClient | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
  sesClient = new SESClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });
} else {
  console.warn(
    "⚠️ AWS credentials not configured. Email sending will not work."
  );
}

/**
 * Simplified reply handler for basic use cases
 * Uses SES SendEmailCommand (simpler API) with minimal overhead
 */
async function handleSimpleReply(
  userId: string,
  emailId: string,
  originalEmail: any,
  body: PostEmailReplyRequest,
  idempotencyKey?: string
): Promise<NextResponse> {
  console.log("🚀 Using simplified reply mode");

  // Parse original email data
  let originalFromData = null;
  if (originalEmail.fromData) {
    try {
      originalFromData = JSON.parse(originalEmail.fromData);
    } catch (e) {
      console.error("Failed to parse original fromData:", e);
    }
  }

  // Determine reply recipients
  const originalSenderAddress = originalFromData?.addresses?.[0]?.address;
  if (!originalSenderAddress && !body.to) {
    console.log("⚠️ Cannot determine recipient for reply");
    return NextResponse.json(
      { error: "Cannot determine recipient email address" },
      { status: 400 }
    );
  }

  // Set default values (simplified)
  const toAddresses = body.to
    ? toArray(body.to)
    : [originalFromData?.text || originalSenderAddress];
  const subject =
    body.subject || `Re: ${originalEmail.subject || "No Subject"}`;

  // Extract sender information
  const fromAddress = extractEmailAddress(body.from);
  const fromDomain = extractDomain(body.from);
  // Use provided from_name, or extract name from combined format, or no name
  const senderName = body.from_name || extractEmailName(body.from) || undefined;
  const formattedFromAddress = formatSenderAddress(fromAddress, senderName);

  console.log("📧 Simple reply details:", {
    from: body.from,
    to: toAddresses,
    subject,
    originalMessageId: originalEmail.messageId,
  });

  // Domain verification (keep security checks)
  const { isAgentEmail } = canUserSendFromEmail(body.from);

  if (!isAgentEmail) {
    console.log("🔍 Verifying domain ownership for:", fromDomain);
    const userDomain = await db
      .select()
      .from(emailDomains)
      .where(
        and(
          eq(emailDomains.userId, userId),
          eq(emailDomains.domain, fromDomain),
          eq(emailDomains.status, "verified")
        )
      )
      .limit(1);

    if (userDomain.length === 0) {
      console.log("❌ User does not own the sender domain:", fromDomain);
      return NextResponse.json(
        {
          error: `You don't have permission to send from domain: ${fromDomain}`,
        },
        { status: 403 }
      );
    }
  }

  // Check Autumn for email sending limits (keep existing logic)
  console.log("🔍 Checking email sending limits with Autumn");
  const { data: emailCheck, error: emailCheckError } = await autumn.check({
    customer_id: userId,
    feature_id: "emails_sent",
  });

  if (emailCheckError) {
    console.error("❌ Autumn email check error:", emailCheckError);
    return NextResponse.json(
      { error: "Failed to check email sending limits" },
      { status: 500 }
    );
  }

  if (!emailCheck.allowed) {
    console.log("❌ Email sending limit reached for user:", userId);
    return NextResponse.json(
      {
        error:
          "Email sending limit reached. Please upgrade your plan to send more emails.",
      },
      { status: 429 }
    );
  }

  // Create basic email record
  const replyEmailId = nanoid();
  const messageId = `${replyEmailId}@${fromDomain}`;

  console.log("💾 Creating simple email record:", replyEmailId);

  const sentEmailRecord = await db
    .insert(sentEmails)
    .values({
      id: replyEmailId,
      from: formattedFromAddress,
      fromAddress,
      fromDomain,
      to: JSON.stringify(toAddresses),
      cc: null, // Simplified - no CC/BCC support in simple mode
      bcc: null,
      replyTo: null,
      subject,
      textBody: body.text || "",
      htmlBody: body.html || null,
      headers: JSON.stringify({
        "In-Reply-To": originalEmail.messageId
          ? `<${originalEmail.messageId}>`
          : null,
        References: originalEmail.messageId
          ? `<${originalEmail.messageId}>`
          : null,
        ...(body.headers || {}),
      }),
      attachments: null, // Simplified - no attachments in simple mode
      tags: body.tags ? JSON.stringify(body.tags) : null,
      status: SENT_EMAIL_STATUS.PENDING,
      messageId,
      userId,
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  // Check if SES is configured
  if (!sesClient) {
    console.log("❌ AWS SES not configured");

    await db
      .update(sentEmails)
      .set({
        status: SENT_EMAIL_STATUS.FAILED,
        failureReason: "AWS SES not configured",
        updatedAt: new Date(),
      })
      .where(eq(sentEmails.id, replyEmailId));

    return NextResponse.json(
      { error: "Email service not configured. Please contact support." },
      { status: 500 }
    );
  }

  try {
    console.log("📤 Sending simple reply email via AWS SES");

    // Build threading headers for RFC 5322 compliance
    // Ensure proper angle bracket formatting
    const formatMessageId = (id: string) => {
      if (!id) return "";
      id = id.trim();
      if (!id.startsWith("<")) id = `<${id}`;
      if (!id.endsWith(">")) id = `${id}>`;
      return id;
    };

    const inReplyTo = originalEmail.messageId
      ? formatMessageId(originalEmail.messageId)
      : undefined;
    let references: string[] = [];

    // Parse existing references if available
    if (originalEmail.references) {
      try {
        const parsedRefs = JSON.parse(originalEmail.references);
        if (Array.isArray(parsedRefs)) {
          // Ensure each reference has angle brackets
          references = parsedRefs.map((ref) => formatMessageId(ref));
        }
      } catch (e) {
        console.error("Failed to parse references:", e);
      }
    }

    // Add the original message ID to references chain
    if (originalEmail.messageId) {
      const formattedId = formatMessageId(originalEmail.messageId);
      // Only add if not already in references (avoid duplicates)
      if (!references.includes(formattedId)) {
        references.push(formattedId);
      }
    }

    // Build a simplified raw email message for threading support
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    let rawMessage = "";

    // Ensure Message-ID has proper format
    const formattedMessageId = formatMessageId(messageId);

    // Log threading information for debugging
    console.log("📧 Threading headers:", {
      messageId: formattedMessageId,
      inReplyTo: inReplyTo,
      references: references,
      originalMessageId: originalEmail.messageId,
    });

    // Add headers
    rawMessage += `From: ${formattedFromAddress}\r\n`;
    rawMessage += `To: ${toAddresses.join(", ")}\r\n`;
    rawMessage += `Subject: ${subject}\r\n`;
    rawMessage += `Message-ID: ${formattedMessageId}\r\n`;

    // Add threading headers if we have them
    if (inReplyTo) {
      rawMessage += `In-Reply-To: ${inReplyTo}\r\n`;
    }
    if (references.length > 0) {
      rawMessage += `References: ${references.join(" ")}\r\n`;
    }

    rawMessage += `Date: ${formatEmailDate(new Date())}\r\n`;
    rawMessage += `MIME-Version: 1.0\r\n`;

    // Handle content based on what's provided
    if (body.html && body.text) {
      // Multipart alternative
      rawMessage += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;

      // Text part
      rawMessage += `--${boundary}\r\n`;
      rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
      rawMessage += `${body.text}\r\n`;

      // HTML part
      rawMessage += `--${boundary}\r\n`;
      rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
      rawMessage += `${body.html}\r\n`;

      rawMessage += `--${boundary}--\r\n`;
    } else if (body.html) {
      // HTML only
      rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
      rawMessage += `${body.html}\r\n`;
    } else {
      // Text only
      rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
      rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
      rawMessage += `${body.text}\r\n`;
    }

    // Use SendRawEmailCommand for proper header support
    const sesCommand = new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawMessage),
      },
      Source: fromAddress,
      Destinations: toAddresses.map(extractEmailAddress),
    });

    const sesResponse = await sesClient.send(sesCommand);
    const sesMessageId = sesResponse.MessageId;

    console.log("✅ Simple reply sent successfully via SES:", sesMessageId);

    // Update email record with success
    await db
      .update(sentEmails)
      .set({
        status: SENT_EMAIL_STATUS.SENT,
        providerResponse: JSON.stringify(sesResponse),
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sentEmails.id, replyEmailId));

    // Track email usage with Autumn (keep existing logic)
    if (!emailCheck.unlimited) {
      console.log("📊 Tracking email usage with Autumn");
      const { error: trackError } = await autumn.track({
        customer_id: userId,
        feature_id: "emails_sent",
        value: 1,
      });

      if (trackError) {
        console.error("❌ Failed to track email usage:", trackError);
        // Don't fail the request if tracking fails
      }
    }

    console.log("✅ Simple reply processing complete");
    const response: PostEmailReplyResponse = {
      id: replyEmailId,
      messageId: messageId,
      awsMessageId: sesMessageId || "",
    };
    return NextResponse.json(response, { status: 200 });
  } catch (sesError) {
    console.error("❌ SES send error in simple mode:", sesError);

    // Update email status to failed
    await db
      .update(sentEmails)
      .set({
        status: SENT_EMAIL_STATUS.FAILED,
        failureReason:
          sesError instanceof Error ? sesError.message : "Unknown SES error",
        providerResponse: JSON.stringify(sesError),
        updatedAt: new Date(),
      })
      .where(eq(sentEmails.id, replyEmailId));

    return NextResponse.json(
      { error: "Failed to send reply. Please try again later." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log("📧 POST /api/v2/emails/[id]/reply - Starting request");

  try {
    console.log("🔐 Validating request authentication");
    const authResult = await validateRequest(request)

    if ('error' in authResult) {

      console.log('❌ Authentication/Rate limit failed:', authResult.error)

      const status = authResult.status || 401

      const headers: Record<string, string> = {}

      if (status === 429 && authResult.retryAfter) {

        headers['Retry-After'] = authResult.retryAfter.toString()

        headers['X-RateLimit-Limit'] = (authResult.limit || 0).toString()

        headers['X-RateLimit-Remaining'] = (authResult.remaining || 0).toString()

      }

      return NextResponse.json({ error: authResult.error }, { status, headers })

    }

    const { userId } = authResult
    console.log("✅ Authentication successful for userId:", userId);

    const { id: emailId } = await params;
    console.log("📨 Replying to email ID:", emailId);

    // Validate email ID
    if (!emailId || typeof emailId !== "string") {
      console.log("⚠️ Invalid email ID provided:", emailId);
      return NextResponse.json(
        { error: "Valid email ID is required" },
        { status: 400 }
      );
    }

    // Idempotency Key Check -> this is used so we don't send duplicate replies.
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      console.log("🔑 Idempotency key provided:", idempotencyKey);

      // Check if we've already processed this request
      const existingEmail = await db
        .select()
        .from(sentEmails)
        .where(
          and(
            eq(sentEmails.userId, userId),
            eq(sentEmails.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      if (existingEmail.length > 0) {
        console.log(
          "♻️ Idempotent request - returning existing email:",
          existingEmail[0].id
        );
        return NextResponse.json({ id: existingEmail[0].id });
      }
    }

    // Retrieve the original email from the database where inbounds are stored
    console.log("🔍 Fetching original email");
    const originalEmail = await db
      .select()
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.id, emailId),
          eq(structuredEmails.userId, userId)
        )
      )
      .limit(1);

    if (originalEmail.length === 0) {
      console.log("📭 Original email not found");
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const original = originalEmail[0];

    const body: PostEmailReplyRequest = await request.json();

    // Parse original email data
    let originalFromData = null;
    if (original.fromData) {
      try {
        originalFromData = JSON.parse(original.fromData);
      } catch (e) {
        console.error("Failed to parse original fromData:", e);
      }
    }

    // Determine reply recipients
    const originalSenderAddress = originalFromData?.addresses?.[0]?.address;
    if (!originalSenderAddress && !body.to) {
      console.log("⚠️ Cannot determine recipient for reply");
      return NextResponse.json(
        { error: "Cannot determine recipient email address" },
        { status: 400 }
      );
    }

    // Set default values
    const toAddresses = body.to
      ? toArray(body.to)
      : [originalFromData?.text || originalSenderAddress];
    const subject = body.subject || `Re: ${original.subject || "No Subject"}`;
    const includeOriginal =
      (body.includeOriginal ?? body.include_original) !== false; // Default to true, support both formats

    // Validate required fields
    if (!body.from) {
      console.log("⚠️ Missing required field: from");
      return NextResponse.json(
        { error: "From address is required" },
        { status: 400 }
      );
    }

    // Validate email content
    if (!body.html && !body.text) {
      console.log("⚠️ No email content provided");
      return NextResponse.json(
        { error: "Either html or text content must be provided" },
        { status: 400 }
      );
    }

    // Extract sender information and format with name if provided
    const fromAddress = extractEmailAddress(body.from);
    const fromDomain = extractDomain(body.from);
    // Use provided from_name, or extract name from combined format, or no name
    const senderName =
      body.from_name || extractEmailName(body.from) || undefined;
    const formattedFromAddress = formatSenderAddress(fromAddress, senderName);

    console.log("📧 Reply details:", {
      from: body.from,
      to: toAddresses,
      subject,
      originalMessageId: original.messageId,
    });

    // Check if this is the special agent@inbnd.dev email (allowed for all users)
    const { isAgentEmail } = canUserSendFromEmail(body.from);

    if (isAgentEmail) {
      console.log("❌ Agent email cannot be used for replies");
      return NextResponse.json(
        {
          error:
            "agent@inbnd.dev cannot be used for replies. Please use a verified domain email address.",
        },
        { status: 400 }
      );
    } else {
      // Verify sender domain ownership for non-agent emails
      console.log("🔍 Verifying domain ownership for:", fromDomain);
      const userDomain = await db
        .select()
        .from(emailDomains)
        .where(
          and(
            eq(emailDomains.userId, userId),
            eq(emailDomains.domain, fromDomain),
            eq(emailDomains.status, "verified")
          )
        )
        .limit(1);

      if (userDomain.length === 0) {
        console.log("❌ User does not own the sender domain:", fromDomain);
        return NextResponse.json(
          {
            error: `You don't have permission to send from domain: ${fromDomain}`,
          },
          { status: 403 }
        );
      }

      console.log("✅ Domain ownership verified");
    }

    // Convert recipients to arrays
    const ccAddresses = toArray(body.cc);
    const bccAddresses = toArray(body.bcc);
    const replyToAddresses = toArray(body.replyTo || body.reply_to); // Support both formats

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses];

    for (const email of allRecipients) {
      const address = extractEmailAddress(email);
      if (!emailRegex.test(address)) {
        console.log("⚠️ Invalid email format:", email);
        return NextResponse.json(
          { error: `Invalid email format: ${email}` },
          { status: 400 }
        );
      }
    }

    // Process attachments if provided
    console.log("📎 Processing reply attachments");
    let processedAttachments: any[] = [];
    if (body.attachments && body.attachments.length > 0) {
      try {
        processedAttachments = await processAttachments(body.attachments);
        console.log(
          "✅ Reply attachments processed successfully:",
          processedAttachments.length
        );
      } catch (attachmentError) {
        console.error("❌ Reply attachment processing error:", attachmentError);
        return NextResponse.json(
          {
            error:
              attachmentError instanceof Error
                ? attachmentError.message
                : "Failed to process attachments",
          },
          { status: 400 }
        );
      }
    }

    const { data: emailCheck, error: emailCheckError } = await autumn.check({
      customer_id: userId,
      feature_id: "emails_sent",
    });

    if (emailCheckError) {
      console.error("❌ Autumn email check error:", emailCheckError);
      return NextResponse.json(
        { error: "Failed to check email sending limits" },
        { status: 500 }
      );
    }

    if (!emailCheck.allowed) {
      console.log("❌ Email sending limit reached for user:", userId);
      return NextResponse.json(
        {
          error:
            "Email sending limit reached. Please upgrade your plan to send more emails.",
        },
        { status: 429 }
      );
    }

    // Check if simple mode is requested
    if (body.simple) {
      console.log("🚀 Simple mode requested, delegating to handleSimpleReply");
      return await handleSimpleReply(
        userId,
        emailId,
        original,
        body,
        idempotencyKey || undefined
      );
    }

    // Helper to ensure proper Message-ID format with angle brackets
    const formatMessageIdForThreading = (id: string) => {
      if (!id) return "";
      id = id.trim();
      if (!id.startsWith("<")) id = `<${id}`;
      if (!id.endsWith(">")) id = `${id}>`;
      return id;
    };

    // Build threading headers
    const inReplyTo = original.messageId
      ? formatMessageIdForThreading(original.messageId)
      : undefined;
    let references: string[] = [];

    // Parse existing references
    if (original.references) {
      try {
        const parsedRefs = JSON.parse(original.references);
        if (Array.isArray(parsedRefs)) {
          // Ensure each reference has angle brackets
          references = parsedRefs.map((ref) =>
            formatMessageIdForThreading(ref)
          );
        }
      } catch (e) {
        console.error("Failed to parse references:", e);
      }
    }

    // Add the original message ID to references
    if (original.messageId) {
      const formattedId = formatMessageIdForThreading(original.messageId);
      // Only add if not already in references (avoid duplicates)
      if (!references.includes(formattedId)) {
        references.push(formattedId);
      }
    }

    // Add quoted original message to text body
    let finalTextBody = body.text || "";
    if (includeOriginal && body.text) {
      finalTextBody += quoteMessage(original, true);
    }

    // Add quoted original message to HTML body
    let finalHtmlBody = body.html || "";
    if (includeOriginal && body.html && original.htmlBody) {
      // HTML quoting with Gmail-style formatting
      const fromText = originalFromData?.text || "Unknown Sender";
      const dateStr = original.date
        ? formatEmailDate(new Date(original.date))
        : "Unknown Date";

      finalHtmlBody += `
                <div dir="ltr">
                    <br><br>
                    <div class="gmail_quote">
                        <div dir="ltr" class="gmail_attr">
                            On ${dateStr}, ${fromText} wrote:<br>
                        </div>
                        <blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
                            ${original.htmlBody}
                        </blockquote>
                    </div>
                </div>
            `;
    }

    // Create sent email record
    const replyEmailId = nanoid();

    // Check if a custom Message-ID is provided (case-insensitive)
    let messageId = `${replyEmailId}@${fromDomain}`;
    if (body.headers) {
      // Find Message-ID header case-insensitively
      const messageIdKey = Object.keys(body.headers).find(
        (key) => key.toLowerCase() === "message-id"
      );
      if (messageIdKey && body.headers[messageIdKey]) {
        // Extract the Message-ID value (remove angle brackets if present)
        messageId = body.headers[messageIdKey].replace(/^<|>$/g, "");
      }
    }

    // Log threading info for debugging
    console.log("📧 Full mode threading headers:", {
      messageId: messageId,
      inReplyTo: inReplyTo,
      references: references,
      originalMessageId: original.messageId,
    });

    console.log("💾 Creating sent email record:", replyEmailId);

    const sentEmailRecord = await db
      .insert(sentEmails)
      .values({
        id: replyEmailId,
        from: formattedFromAddress,
        fromAddress,
        fromDomain,
        to: JSON.stringify(toAddresses),
        cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
        bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
        replyTo:
          replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
        subject,
        textBody: finalTextBody,
        htmlBody: finalHtmlBody,
        headers: JSON.stringify({
          ...(body.headers || {}),
          "In-Reply-To": inReplyTo,
          References: references.join(" "),
        }),
        attachments:
          processedAttachments.length > 0
            ? JSON.stringify(attachmentsToStorageFormat(processedAttachments))
            : null,
        tags: body.tags ? JSON.stringify(body.tags) : null, // Store tags
        status: SENT_EMAIL_STATUS.PENDING,
        messageId,
        userId,
        idempotencyKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Check if SES is configured
    if (!sesClient) {
      console.log("❌ AWS SES not configured");

      // Update email status to failed
      await db
        .update(sentEmails)
        .set({
          status: SENT_EMAIL_STATUS.FAILED,
          failureReason: "AWS SES not configured",
          updatedAt: new Date(),
        })
        .where(eq(sentEmails.id, replyEmailId));

      return NextResponse.json(
        { error: "Email service not configured. Please contact support." },
        { status: 500 }
      );
    }

    try {
      console.log("📤 Sending reply email via AWS SES");

      // Build raw email message with proper headers and attachments
      const rawMessage = buildRawEmailMessage({
        from: formattedFromAddress,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        replyTo: replyToAddresses,
        subject,
        textBody: finalTextBody,
        htmlBody: finalHtmlBody,
        messageId,
        inReplyTo,
        references,
        date: new Date(),
        customHeaders: body.headers,
        attachments: processedAttachments,
      });

      // Send raw email to preserve headers
      const sesCommand = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawMessage),
        },
        Source: fromAddress,
        Destinations: [...toAddresses, ...ccAddresses, ...bccAddresses].map(
          extractEmailAddress
        ),
      });

      const sesResponse = await sesClient.send(sesCommand);
      const sesMessageId = sesResponse.MessageId;

      console.log("✅ Reply sent successfully via SES:", sesMessageId);

      // Update email record with success
      await db
        .update(sentEmails)
        .set({
          status: SENT_EMAIL_STATUS.SENT,
          providerResponse: JSON.stringify(sesResponse),
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sentEmails.id, replyEmailId));

      // Track email usage with Autumn (only if not unlimited)
      if (!emailCheck.unlimited) {
        console.log("📊 Tracking email usage with Autumn");
        const { error: trackError } = await autumn.track({
          customer_id: userId,
          feature_id: "emails_sent",
          value: 1,
        });

        if (trackError) {
          console.error("❌ Failed to track email usage:", trackError);
          // Don't fail the request if tracking fails
        }
      }

      console.log("✅ Reply processing complete");
      const response: PostEmailReplyResponse = {
        id: replyEmailId,
        messageId: messageId, // The Inbound message ID used for threading
        awsMessageId: sesMessageId || "", // The AWS SES Message ID
      };
      return NextResponse.json(response, { status: 200 });
    } catch (sesError) {
      console.error("❌ SES send error:", sesError);

      // Update email status to failed
      await db
        .update(sentEmails)
        .set({
          status: SENT_EMAIL_STATUS.FAILED,
          failureReason:
            sesError instanceof Error ? sesError.message : "Unknown SES error",
          providerResponse: JSON.stringify(sesError),
          updatedAt: new Date(),
        })
        .where(eq(sentEmails.id, replyEmailId));

      return NextResponse.json(
        { error: "Failed to send reply. Please try again later." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(
      "💥 Unexpected error in POST /api/v2/emails/[id]/reply:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
