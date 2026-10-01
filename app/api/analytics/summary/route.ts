import { timingSafeEqual } from "node:crypto";
import { gte, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { dayKey, lastDays, readOverview, readPage } from "@/lib/analytics/store";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

const DETAILED_PAGES = 5;

function hasValidToken(request: Request) {
	const expected = process.env.ANALYTICS_API_TOKEN;
	const header = request.headers.get("authorization") ?? "";
	if (!expected || !header.startsWith("Bearer ")) return false;
	const provided = Buffer.from(header.slice("Bearer ".length));
	const secret = Buffer.from(expected);
	return provided.length === secret.length && timingSafeEqual(provided, secret);
}

async function isAdminSession() {
	const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
	return session?.user?.role === "admin";
}

export async function GET(request: Request) {
	if (!hasValidToken(request) && !(await isAdminSession())) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const range = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 14));
	const days = lastDays(range);
	const since = new Date(`${days[0]}T00:00:00Z`);

	const [overview, newUsers, welcomeFunnel] = await Promise.all([
		readOverview(days),
		db.select({ createdAt: user.createdAt }).from(user).where(gte(user.createdAt, since)),
		// /welcome funnel: instant inbnd.dev inboxes created in range, and how many got mail
		db.execute<{ created: number; received_email: number }>(sql`
			select count(*)::int as created,
				count(*) filter (where exists (
					select 1 from structured_emails se
					where se.user_id = d.user_id and se.recipient ilike '%@' || d.domain
				))::int as received_email
			from email_domains d
			where d.kind = 'managed' and d.created_at >= ${since.toISOString()}
		`),
	]);

	const signupsByDay: Record<string, number> = {};
	for (const row of newUsers) {
		const day = dayKey(row.createdAt);
		signupsByDay[day] = (signupsByDay[day] ?? 0) + 1;
	}

	const pages = await Promise.all(
		overview.topPages.slice(0, DETAILED_PAGES).map(async (page) => {
			const detail = await readPage(days, page.path);
			return {
				path: page.path,
				pageviews: page.pageviews,
				visitors: page.visitors,
				clicks: detail.clicks.slice(0, 10),
				scrollReach: detail.scroll.map((step) => ({
					depth: step.step,
					share: detail.pageviews ? step.count / detail.pageviews : 0,
				})),
			};
		}),
	);

	return Response.json({
		generatedAt: new Date().toISOString(),
		timezone: "UTC",
		range: { days: range, from: days[0], to: days[days.length - 1] },
		totals: {
			uniqueVisitors: overview.uniqueVisitors,
			pageviews: overview.totalPageviews,
			signups: newUsers.length,
		},
		daily: overview.days.map((day) => ({ ...day, signups: signupsByDay[day.day] ?? 0 })),
		topPages: overview.topPages,
		referrers: overview.referrers,
		devices: overview.devices,
		pages,
		welcome: {
			inboxesCreated: Number(welcomeFunnel.rows?.[0]?.created ?? 0),
			inboxesThatReceivedEmail: Number(welcomeFunnel.rows?.[0]?.received_email ?? 0),
		},
	});
}
