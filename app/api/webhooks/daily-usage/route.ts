import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import DailyUsageSummaryEmail from "@/emails/daily-usage-summary";
import { render } from "@react-email/render";
import Inbound from "inboundemail";
import { assertCronAuthorized } from "@/lib/security/cron-auth";

export const maxDuration = 300;

export async function GET(request: Request) {
	const unauthorizedResponse = assertCronAuthorized(request, "daily-usage");
	if (unauthorizedResponse) {
		return unauthorizedResponse;
	}

	const now = new Date();
	const start = new Date(now);
	start.setUTCHours(0, 0, 0, 0);
	const end = new Date(now);
	end.setUTCHours(23, 59, 59, 999);

	// Aggregate totals
	// Note: structured_emails.from_data is JSON text with structure: { text: string, addresses: Array<{name: string|null, address: string|null}> }
	// - unique_senders: distinct senders FROM received emails (extracted from from_data JSON)
	// - unique_recipients: distinct recipient addresses we received emails FOR (from recipient field)
	const totalsRes = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM sent_emails WHERE created_at BETWEEN ${start} AND ${end})::int AS sent,
      (SELECT COUNT(*) FROM structured_emails WHERE created_at BETWEEN ${start} AND ${end})::int AS received,
      (SELECT COUNT(DISTINCT 
        CASE 
          WHEN from_data IS NOT NULL AND (from_data::jsonb->'addresses') IS NOT NULL 
            AND jsonb_array_length(from_data::jsonb->'addresses') > 0
          THEN (from_data::jsonb->'addresses'->0->>'address')
          ELSE NULL
        END
      ) FROM structured_emails 
      WHERE created_at BETWEEN ${start} AND ${end}
        AND from_data IS NOT NULL)::int AS unique_senders,
      (SELECT COUNT(DISTINCT recipient) FROM structured_emails 
      WHERE created_at BETWEEN ${start} AND ${end}
        AND recipient IS NOT NULL)::int AS unique_recipients
  `);
	const totalsRow: Record<string, unknown> = totalsRes.rows[0] || {
		sent: 0,
		received: 0,
		unique_senders: 0,
		unique_recipients: 0,
	};

	// Top users for the day
	const topUsersRes = await db.execute(sql`
    SELECT
      u.email AS user_email,
      u.name AS user_name,
      COALESCE(s.sent, 0)::int AS sent,
      COALESCE(r.received, 0)::int AS received,
      (COALESCE(s.sent, 0) + COALESCE(r.received, 0))::int AS total
    FROM "user" u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS sent
      FROM sent_emails
      WHERE created_at BETWEEN ${start} AND ${end}
      GROUP BY user_id
    ) s ON s.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS received
      FROM structured_emails
      WHERE created_at BETWEEN ${start} AND ${end}
      GROUP BY user_id
    ) r ON r.user_id = u.id
    ORDER BY total DESC
    LIMIT 10
  `);
	const topUsers = (topUsersRes.rows as Record<string, unknown>[]).map((r) => ({
		userEmail: r.user_email as string,
		userName: (r.user_name ?? null) as string | null,
		sent: Number(r.sent || 0),
		received: Number(r.received || 0),
		total: Number(r.total || 0),
	}));

	const html = await render(
		DailyUsageSummaryEmail({
			dateLabel: now.toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
			}),
			totals: {
				sent: Number(totalsRow.sent || 0),
				received: Number(totalsRow.received || 0),
				uniqueSenders: Number(totalsRow.unique_senders || 0),
				uniqueRecipients: Number(totalsRow.unique_recipients || 0),
			},
			topUsers,
		}),
	);

	const inbound = new Inbound({
		apiKey: process.env.INBOUND_API_KEY!,
	});
	const toEmail = process.env.USAGE_REPORT_TO || "ryan@inboundemail.com";
	await inbound.emails.send({
		from: "inbound reports <notifications@inbound.new>",
		to: toEmail,
		subject: `Daily usage • ${now.toLocaleDateString("en-US")}`,
		html,
		tags: [{ name: "type", value: "daily-usage" }],
	});

	return new Response(null, { status: 204 });
}
