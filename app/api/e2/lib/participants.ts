import { db } from "@/lib/db"
import { structuredEmails, sentEmails } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"

/**
 * Format a participant as "Name <email>" or just "email" if no name is available
 */
export function formatParticipant(name: string | null, email: string): string {
  if (name && name.trim()) {
    return `${name} <${email}>`
  }
  return email
}

/**
 * Get formatted participant names for a thread from email from_data and to_data
 * Returns array of strings in format "First Last <email@domain.com>" or just "email@domain.com"
 */
export async function getThreadParticipantNames(
  threadId: string,
  userId: string
): Promise<string[]> {
  // Get all emails in the thread to extract participant names
  const emails = await db
    .select({
      fromData: structuredEmails.fromData,
      toData: structuredEmails.toData,
      ccData: structuredEmails.ccData,
    })
    .from(structuredEmails)
    .where(
      and(
        eq(structuredEmails.threadId, threadId),
        eq(structuredEmails.userId, userId)
      )
    )

  // Also get sent emails for participant names
  const sentEmailsList = await db
    .select({
      from: sentEmails.from,
      to: sentEmails.to,
    })
    .from(sentEmails)
    .where(
      and(eq(sentEmails.threadId, threadId), eq(sentEmails.userId, userId))
    )

  return getParticipantNames(emails, sentEmailsList)
}

export async function getThreadParticipantNamesBatch(
  threadIds: string[],
  userId: string
): Promise<Map<string, string[]>> {
  if (threadIds.length === 0) return new Map()

  const [emails, sentEmailsList] = await Promise.all([
    db
      .select({
        threadId: structuredEmails.threadId,
        fromData: structuredEmails.fromData,
        toData: structuredEmails.toData,
        ccData: structuredEmails.ccData,
      })
      .from(structuredEmails)
      .where(
        and(
          inArray(structuredEmails.threadId, threadIds),
          eq(structuredEmails.userId, userId)
        )
      ),
    db
      .select({
        threadId: sentEmails.threadId,
        from: sentEmails.from,
        to: sentEmails.to,
      })
      .from(sentEmails)
      .where(
        and(inArray(sentEmails.threadId, threadIds), eq(sentEmails.userId, userId))
      ),
  ])

  const inboundByThread = new Map<string, typeof emails>()
  for (const email of emails) {
    if (email.threadId === null) continue
    const threadEmails = inboundByThread.get(email.threadId) ?? []
    threadEmails.push(email)
    inboundByThread.set(email.threadId, threadEmails)
  }

  const outboundByThread = new Map<string, typeof sentEmailsList>()
  for (const email of sentEmailsList) {
    if (email.threadId === null) continue
    const threadEmails = outboundByThread.get(email.threadId) ?? []
    threadEmails.push(email)
    outboundByThread.set(email.threadId, threadEmails)
  }

  return new Map(
    threadIds.map((threadId) => [
      threadId,
      getParticipantNames(
        inboundByThread.get(threadId) ?? [],
        outboundByThread.get(threadId) ?? []
      ),
    ])
  )
}

function getParticipantNames(
  emails: Pick<
    typeof structuredEmails.$inferSelect,
    "fromData" | "toData" | "ccData"
  >[],
  sentEmailsList: Pick<typeof sentEmails.$inferSelect, "from" | "to">[]
): string[] {
  // Map of email -> formatted name (to deduplicate and keep best name)
  const participantMap = new Map<string, string>()

  // Process inbound emails
  for (const email of emails) {
    // Parse from_data
    if (email.fromData) {
      try {
        const fromParsed = JSON.parse(email.fromData)
        if (fromParsed.addresses && Array.isArray(fromParsed.addresses)) {
          for (const addr of fromParsed.addresses) {
            if (addr.address) {
              const formatted = formatParticipant(addr.name, addr.address)
              // Only update if we have a name and the existing entry doesn't have one
              const existing = participantMap.get(addr.address.toLowerCase())
              if (!existing || (addr.name && !existing.includes("<"))) {
                participantMap.set(addr.address.toLowerCase(), formatted)
              }
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Parse to_data
    if (email.toData) {
      try {
        const toParsed = JSON.parse(email.toData)
        if (toParsed.addresses && Array.isArray(toParsed.addresses)) {
          for (const addr of toParsed.addresses) {
            if (addr.address) {
              const formatted = formatParticipant(addr.name, addr.address)
              const existing = participantMap.get(addr.address.toLowerCase())
              if (!existing || (addr.name && !existing.includes("<"))) {
                participantMap.set(addr.address.toLowerCase(), formatted)
              }
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Parse cc_data
    if (email.ccData) {
      try {
        const ccParsed = JSON.parse(email.ccData)
        if (ccParsed.addresses && Array.isArray(ccParsed.addresses)) {
          for (const addr of ccParsed.addresses) {
            if (addr.address) {
              const formatted = formatParticipant(addr.name, addr.address)
              const existing = participantMap.get(addr.address.toLowerCase())
              if (!existing || (addr.name && !existing.includes("<"))) {
                participantMap.set(addr.address.toLowerCase(), formatted)
              }
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Process sent emails (outbound)
  for (const sent of sentEmailsList) {
    // From address for sent emails
    if (sent.from) {
      const fromEmail = sent.from.toLowerCase()
      if (!participantMap.has(fromEmail)) {
        participantMap.set(fromEmail, sent.from)
      }
    }

    // To addresses for sent emails
    if (sent.to) {
      try {
        const toAddresses = JSON.parse(sent.to)
        if (Array.isArray(toAddresses)) {
          for (const addr of toAddresses) {
            const email = typeof addr === "string" ? addr : addr.address || addr
            if (email && !participantMap.has(email.toLowerCase())) {
              participantMap.set(email.toLowerCase(), email)
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return Array.from(participantMap.values())
}
