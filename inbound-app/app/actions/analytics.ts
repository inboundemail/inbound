"use server";

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  structuredEmails,
  sesEvents,
  emailDomains,
  emailAddresses,
  DOMAIN_STATUS,
} from "@/lib/db/schema";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";

// Analytics response interface - only defining the API response structure
export interface AnalyticsData {
  stats: {
    totalEmails: number;
    emailsLast24h: number;
    emailsLast7d: number;
    emailsLast30d: number;
    totalDomains: number;
    verifiedDomains: number;
    totalEmailAddresses: number;
    avgProcessingTime: number;
  };
  recentEmails: Array<{
    id: string;
    messageId: string;
    from: string;
    recipient: string;
    subject: string;
    receivedAt: string;
    status: string;
    domain: string;
    isRead: boolean;
    readAt?: string;
    authResults: {
      spf: string;
      dkim: string;
      dmarc: string;
      spam: string;
      virus: string;
    };
    hasContent: boolean;
    contentSize?: number;
  }>;
  emailsByHour: Array<{
    hour: string;
    count: number;
  }>;
  emailsByDay?: Array<{
    date: string;
    count: number;
  }>;
  emailsByDomain: Array<{
    domain: string;
    count: number;
    percentage: number;
  }>;
  authResultsStats: {
    spf: { pass: number; fail: number; neutral: number };
    dkim: { pass: number; fail: number; neutral: number };
    dmarc: { pass: number; fail: number; neutral: number };
    spam: { pass: number; fail: number };
    virus: { pass: number; fail: number };
  };
}

// Reusable type aliases to avoid duplication and to enable granular server action returns
export type AnalyticsStats = AnalyticsData["stats"];
export type AnalyticsRecentEmail = AnalyticsData["recentEmails"][number];
export type AnalyticsEmailsByHour = AnalyticsData["emailsByHour"][number];
export type AnalyticsEmailsByDomain = AnalyticsData["emailsByDomain"][number];
export type AnalyticsAuthResultsStats = AnalyticsData["authResultsStats"];

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user?.id ?? null;
}

export async function getAnalyticsStats(): Promise<
  { success: true; data: AnalyticsStats } | { success: false; error: string }
> {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: "Unauthorized" };

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalEmailsResult,
      emails24hResult,
      emails7dResult,
      emails30dResult,
      totalDomainsResult,
      verifiedDomainsResult,
      totalEmailAddressesResult,
      avgProcessingTimeResult,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(structuredEmails)
        .where(eq(structuredEmails.userId, userId)),
      db
        .select({ count: count() })
        .from(structuredEmails)
        .where(
          and(
            eq(structuredEmails.userId, userId),
            gte(structuredEmails.createdAt, last24h)
          )
        ),
      db
        .select({ count: count() })
        .from(structuredEmails)
        .where(
          and(
            eq(structuredEmails.userId, userId),
            gte(structuredEmails.createdAt, last7d)
          )
        ),
      db
        .select({ count: count() })
        .from(structuredEmails)
        .where(
          and(
            eq(structuredEmails.userId, userId),
            gte(structuredEmails.createdAt, last30d)
          )
        ),
      db
        .select({ count: count() })
        .from(emailDomains)
        .where(eq(emailDomains.userId, userId)),
      db
        .select({ count: count() })
        .from(emailDomains)
        .where(
          and(
            eq(emailDomains.userId, userId),
            eq(emailDomains.status, DOMAIN_STATUS.VERIFIED),
            eq(emailDomains.canReceiveEmails, true)
          )
        ),
      db
        .select({ count: count() })
        .from(emailAddresses)
        .where(eq(emailAddresses.userId, userId)),
      db
        .select({ avg: sql<number>`AVG(${sesEvents.processingTimeMillis})` })
        .from(sesEvents)
        .innerJoin(
          structuredEmails,
          eq(structuredEmails.sesEventId, sesEvents.id)
        )
        .where(
          and(
            eq(structuredEmails.userId, userId),
            gte(structuredEmails.createdAt, last30d)
          )
        ),
    ]);

    return {
      success: true,
      data: {
        totalEmails: totalEmailsResult[0]?.count || 0,
        emailsLast24h: emails24hResult[0]?.count || 0,
        emailsLast7d: emails7dResult[0]?.count || 0,
        emailsLast30d: emails30dResult[0]?.count || 0,
        totalDomains: totalDomainsResult[0]?.count || 0,
        verifiedDomains: verifiedDomainsResult[0]?.count || 0,
        totalEmailAddresses: totalEmailAddressesResult[0]?.count || 0,
        avgProcessingTime: Math.round(avgProcessingTimeResult[0]?.avg || 0),
      },
    };
  } catch (error) {
    console.error("getAnalyticsStats error:", error);
    return { success: false, error: "Failed to fetch stats" };
  }
}

export async function getRecentEmails(params?: {
  limit?: number;
  days?: number;
}): Promise<
  | { success: true; data: { recentEmails: AnalyticsRecentEmail[] } }
  | { success: false; error: string }
> {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: "Unauthorized" };

    const limit = params?.limit ?? 100;
    const days = params?.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const recentEmailsQuery = await db
      .select({
        id: structuredEmails.id,
        messageId: structuredEmails.messageId,
        fromData: structuredEmails.fromData,
        toData: structuredEmails.toData,
        subject: structuredEmails.subject,
        createdAt: structuredEmails.createdAt,
        textBody: structuredEmails.textBody,
        htmlBody: structuredEmails.htmlBody,
        rawContent: structuredEmails.rawContent,
        spamVerdict: sesEvents.spamVerdict,
        virusVerdict: sesEvents.virusVerdict,
        spfVerdict: sesEvents.spfVerdict,
        dkimVerdict: sesEvents.dkimVerdict,
        dmarcVerdict: sesEvents.dmarcVerdict,
        emailContent: sesEvents.emailContent,
        s3ContentSize: sesEvents.s3ContentSize,
        processingTimeMillis: sesEvents.processingTimeMillis,
      })
      .from(structuredEmails)
      .leftJoin(sesEvents, eq(structuredEmails.sesEventId, sesEvents.id))
      .where(
        and(
          eq(structuredEmails.userId, userId),
          gte(structuredEmails.createdAt, since)
        )
      )
      .orderBy(desc(structuredEmails.createdAt))
      .limit(limit);

    const parseEmailAddress = (
      jsonData: string | null
    ): { address: string; name?: string } | null => {
      if (!jsonData) return null;
      try {
        const parsed = JSON.parse(jsonData);
        if (parsed?.addresses?.[0]?.address) {
          return {
            address: parsed.addresses[0].address,
            name: parsed.addresses[0].name || undefined,
          };
        }
      } catch (e) {
        console.warn("Failed to parse email address JSON:", e);
      }
      return null;
    };

    const recentEmails: AnalyticsRecentEmail[] = recentEmailsQuery.map(
      (email) => {
        const fromParsed = parseEmailAddress(email.fromData);
        const toParsed = parseEmailAddress(email.toData);
        return {
          id: email.id,
          messageId: email.messageId || "",
          from: fromParsed?.address || "Unknown",
          recipient: toParsed?.address || "Unknown",
          subject: email.subject || "No Subject",
          receivedAt: (email.createdAt || new Date()).toISOString(),
          status: "received",
          domain: toParsed?.address?.split("@")[1] || "",
          isRead: false,
          readAt: undefined,
          authResults: {
            spf: email.spfVerdict || "UNKNOWN",
            dkim: email.dkimVerdict || "UNKNOWN",
            dmarc: email.dmarcVerdict || "UNKNOWN",
            spam: email.spamVerdict || "UNKNOWN",
            virus: email.virusVerdict || "UNKNOWN",
          },
          hasContent: !!(
            email.textBody ||
            email.htmlBody ||
            email.rawContent ||
            email.emailContent
          ),
          contentSize: email.s3ContentSize || undefined,
        };
      }
    );

    return { success: true, data: { recentEmails } };
  } catch (error) {
    console.error("getRecentEmails error:", error);
    return { success: false, error: "Failed to fetch recent emails" };
  }
}

export async function getEmailsByHour(): Promise<
  | { success: true; data: { emailsByHour: AnalyticsEmailsByHour[] } }
  | { success: false; error: string }
> {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: "Unauthorized" };

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emailsByHourQuery = await db
      .select({
        hour: sql<string>`DATE_TRUNC('hour', ${structuredEmails.createdAt})`,
        count: count(),
      })
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.userId, userId),
          gte(structuredEmails.createdAt, last24h)
        )
      )
      .groupBy(sql`DATE_TRUNC('hour', ${structuredEmails.createdAt})`)
      .orderBy(sql`DATE_TRUNC('hour', ${structuredEmails.createdAt})`);

    const map = new Map<string, number>();
    emailsByHourQuery.forEach((item) => {
      const hourDate = new Date(item.hour);
      const hourKey = hourDate.getHours();
      map.set(hourKey.toString(), item.count);
    });

    const emailsByHour: AnalyticsEmailsByHour[] = [];
    for (let i = 0; i < 24; i++) {
      const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
      const ampm = i < 12 ? "AM" : "PM";
      const hourLabel = `${hour12} ${ampm}`;
      emailsByHour.push({ hour: hourLabel, count: map.get(i.toString()) || 0 });
    }

    return { success: true, data: { emailsByHour } };
  } catch (error) {
    console.error("getEmailsByHour error:", error);
    return { success: false, error: "Failed to fetch emails by hour" };
  }
}

export async function getEmailsByDomain(): Promise<
  | { success: true; data: { emailsByDomain: AnalyticsEmailsByDomain[] } }
  | { success: false; error: string }
> {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: "Unauthorized" };

    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const emailsByDomainQuery = await db
      .select({
        domain: sql<string>`SPLIT_PART((${structuredEmails.toData}::jsonb->'addresses'->0->>'address'), '@', 2)`,
        count: count(),
      })
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.userId, userId),
          gte(structuredEmails.createdAt, last7d),
          sql`${structuredEmails.toData} IS NOT NULL`,
          sql`${structuredEmails.toData}::jsonb->'addresses'->0->>'address' IS NOT NULL`
        )
      )
      .groupBy(
        sql`SPLIT_PART((${structuredEmails.toData}::jsonb->'addresses'->0->>'address'), '@', 2)`
      )
      .orderBy(desc(count()))
      .limit(10);

    const total = emailsByDomainQuery.reduce(
      (sum, item) => sum + item.count,
      0
    );
    const emailsByDomain: AnalyticsEmailsByDomain[] = emailsByDomainQuery
      .filter((item) => item.domain && item.domain !== "")
      .map((item) => ({
        domain: item.domain,
        count: item.count,
        percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
      }));

    return { success: true, data: { emailsByDomain } };
  } catch (error) {
    console.error("getEmailsByDomain error:", error);
    return { success: false, error: "Failed to fetch emails by domain" };
  }
}

export async function getAuthResultsStats(): Promise<
  | { success: true; data: { authResultsStats: AnalyticsAuthResultsStats } }
  | { success: false; error: string }
> {
  try {
    const userId = await getUserId();
    if (!userId) return { success: false, error: "Unauthorized" };

    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const authStatsQuery = await db
      .select({
        spfVerdict: sesEvents.spfVerdict,
        dkimVerdict: sesEvents.dkimVerdict,
        dmarcVerdict: sesEvents.dmarcVerdict,
        spamVerdict: sesEvents.spamVerdict,
        virusVerdict: sesEvents.virusVerdict,
        count: count(),
      })
      .from(sesEvents)
      .innerJoin(
        structuredEmails,
        eq(structuredEmails.sesEventId, sesEvents.id)
      )
      .where(
        and(
          eq(structuredEmails.userId, userId),
          gte(structuredEmails.createdAt, last7d)
        )
      )
      .groupBy(
        sesEvents.spfVerdict,
        sesEvents.dkimVerdict,
        sesEvents.dmarcVerdict,
        sesEvents.spamVerdict,
        sesEvents.virusVerdict
      );

    const authResultsStats: AnalyticsAuthResultsStats = {
      spf: { pass: 0, fail: 0, neutral: 0 },
      dkim: { pass: 0, fail: 0, neutral: 0 },
      dmarc: { pass: 0, fail: 0, neutral: 0 },
      spam: { pass: 0, fail: 0 },
      virus: { pass: 0, fail: 0 },
    };

    authStatsQuery.forEach((stat) => {
      const c = stat.count;
      if (stat.spfVerdict === "PASS") authResultsStats.spf.pass += c;
      else if (stat.spfVerdict === "FAIL") authResultsStats.spf.fail += c;
      else authResultsStats.spf.neutral += c;

      if (stat.dkimVerdict === "PASS") authResultsStats.dkim.pass += c;
      else if (stat.dkimVerdict === "FAIL") authResultsStats.dkim.fail += c;
      else authResultsStats.dkim.neutral += c;

      if (stat.dmarcVerdict === "PASS") authResultsStats.dmarc.pass += c;
      else if (stat.dmarcVerdict === "FAIL") authResultsStats.dmarc.fail += c;
      else authResultsStats.dmarc.neutral += c;

      if (stat.spamVerdict === "PASS") authResultsStats.spam.pass += c;
      else authResultsStats.spam.fail += c;

      if (stat.virusVerdict === "PASS") authResultsStats.virus.pass += c;
      else authResultsStats.virus.fail += c;
    });

    return { success: true, data: { authResultsStats } };
  } catch (error) {
    console.error("getAuthResultsStats error:", error);
    return { success: false, error: "Failed to fetch auth results stats" };
  }
}

export async function getAnalytics(): Promise<
  { success: true; data: AnalyticsData } | { success: false; error: string }
> {
  try {
    const timeStart = performance.now();

    const [statsRes, recentRes, byHourRes, byDomainRes, authRes] =
      await Promise.all([
        getAnalyticsStats(),
        getRecentEmails({ limit: 100, days: 7 }),
        getEmailsByHour(),
        getEmailsByDomain(),
        getAuthResultsStats(),
      ]);

    if (!statsRes.success) return { success: false, error: statsRes.error };
    if (!recentRes.success) return { success: false, error: recentRes.error };
    if (!byHourRes.success) return { success: false, error: byHourRes.error };
    if (!byDomainRes.success)
      return { success: false, error: byDomainRes.error };
    if (!authRes.success) return { success: false, error: authRes.error };

    const analyticsData: AnalyticsData = {
      stats: statsRes.data,
      recentEmails: recentRes.data.recentEmails,
      emailsByHour: byHourRes.data.emailsByHour,
      emailsByDomain: byDomainRes.data.emailsByDomain,
      authResultsStats: authRes.data.authResultsStats,
    };

    const timeEnd = performance.now();
    const timeTaken = timeEnd - timeStart;
    console.log(`🕑 Analytics Server Action took ${timeTaken.toFixed(2)}ms`);

    return { success: true, data: analyticsData };
  } catch (error) {
    console.error("Analytics Server Action error:", error);
    return {
      success: false,
      error: "Failed to fetch analytics data",
    };
  }
}
