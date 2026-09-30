import { gte } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { dayKey, lastDays, normalizePath, readOverview, readPage } from "@/lib/analytics/store";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { ExcludeBrowser } from "./exclude-browser";

const RANGES = [7, 30, 90] as const;

function formatNumber(value: number) {
	return value.toLocaleString("en-US");
}

function percent(part: number, whole: number) {
	if (!whole) return "—";
	return `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%`;
}

function shortDay(day: string) {
	return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

export default async function AnalyticsPage({
	searchParams,
}: {
	searchParams: Promise<{ range?: string; page?: string }>;
}) {
	const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
	if (session?.user?.role !== "admin") notFound();

	const params = await searchParams;
	const range = RANGES.find((value) => String(value) === params.range) ?? 30;
	const selectedPage = normalizePath(params.page ?? "/") ?? "/";
	const days = lastDays(range);
	const since = new Date(`${days[0]}T00:00:00Z`);

	const [overview, page, newUsers] = await Promise.all([
		readOverview(days),
		readPage(days, selectedPage),
		db.select({ createdAt: user.createdAt }).from(user).where(gte(user.createdAt, since)),
	]);

	const signupsByDay: Record<string, number> = {};
	for (const row of newUsers) {
		const day = dayKey(row.createdAt);
		signupsByDay[day] = (signupsByDay[day] ?? 0) + 1;
	}
	const totalSignups = newUsers.length;
	const today = overview.days[overview.days.length - 1];
	const peak = Math.max(1, ...overview.days.map((day) => day.visitors));
	const scrollBase = page.pageviews;
	const canOpenPage = !selectedPage.includes(":id");

	const kpis = [
		{ label: "Unique visitors", value: formatNumber(overview.uniqueVisitors), hint: `last ${range} days` },
		{ label: "Visitors today", value: formatNumber(today?.visitors ?? 0), hint: `${formatNumber(today?.sessions ?? 0)} sessions` },
		{ label: "Pageviews", value: formatNumber(overview.totalPageviews), hint: `last ${range} days` },
		{
			label: "Signups",
			value: formatNumber(totalSignups),
			hint: `${percent(totalSignups, overview.uniqueVisitors)} of visitors`,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-4 md:p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading text-2xl font-semibold tracking-tight">Analytics</h1>
					<ExcludeBrowser />
				</div>
				<div className="flex rounded-lg bg-[#f0efee] p-0.5 text-sm">
					{RANGES.map((value) => (
						<Link
							key={value}
							href={`/admin/analytics?range=${value}&page=${encodeURIComponent(selectedPage)}`}
							className={`rounded-[6px] px-3 py-1.5 ${
								value === range ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
							}`}
						>
							{value}d
						</Link>
					))}
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{kpis.map((kpi) => (
					<Card key={kpi.label} className="flex flex-col gap-1 p-5">
						<span className="text-sm text-muted-foreground">{kpi.label}</span>
						<span className="text-3xl font-semibold tracking-tight">{kpi.value}</span>
						<span className="text-xs text-muted-foreground">{kpi.hint}</span>
					</Card>
				))}
			</div>

			<Card className="flex flex-col gap-4 p-5">
				<div className="flex items-center justify-between">
					<span className="font-medium">Daily visitors</span>
					<span className="flex items-center gap-3 text-xs text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<span className="size-2 rounded-sm bg-[#8161FF]" /> visitors
						</span>
						<span className="flex items-center gap-1.5">
							<span className="size-2 rounded-full bg-[#1c1917]" /> signups
						</span>
					</span>
				</div>
				<div className="flex h-48 items-end gap-[3px] border-b">
					{overview.days.map((day) => {
						const signups = signupsByDay[day.day] ?? 0;
						return (
							<div
								key={day.day}
								className="group relative flex h-full flex-1 flex-col justify-end"
								title={`${shortDay(day.day)} · ${day.visitors} visitors · ${day.pageviews} pageviews · ${signups} signups`}
							>
								{signups > 0 && (
									<span className="mb-1 self-center text-[10px] font-medium leading-none">{signups}</span>
								)}
								<div
									className="w-full rounded-t-[3px] bg-[#8161FF] transition-opacity group-hover:opacity-80"
									style={{ height: day.visitors ? `${Math.max(2, (day.visitors / peak) * 100)}%` : "0%" }}
								/>
							</div>
						);
					})}
				</div>
				<div className="flex justify-between text-xs text-muted-foreground">
					<span>{shortDay(days[0])}</span>
					<span>{shortDay(days[Math.floor(days.length / 2)])}</span>
					<span>{shortDay(days[days.length - 1])}</span>
				</div>
			</Card>

			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="flex flex-col p-5 lg:col-span-2">
					<span className="mb-3 font-medium">Top pages</span>
					<div className="grid grid-cols-[1fr_80px_80px] gap-2 border-b pb-2 text-xs text-muted-foreground">
						<span>Page</span>
						<span className="text-right">Views</span>
						<span className="text-right">Visitors</span>
					</div>
					{overview.topPages.length === 0 && (
						<span className="py-6 text-sm text-muted-foreground">No pageviews yet.</span>
					)}
					{overview.topPages.map((row) => (
						<Link
							key={row.path}
							href={`/admin/analytics?range=${range}&page=${encodeURIComponent(row.path)}`}
							className={`grid grid-cols-[1fr_80px_80px] gap-2 border-b py-2 text-sm last:border-0 hover:bg-muted/50 ${
								row.path === selectedPage ? "font-medium text-[#6b4fd9]" : ""
							}`}
						>
							<span className="truncate font-mono text-[13px]">{row.path}</span>
							<span className="text-right tabular-nums">{formatNumber(row.pageviews)}</span>
							<span className="text-right tabular-nums">{formatNumber(row.visitors)}</span>
						</Link>
					))}
				</Card>

				<div className="flex flex-col gap-4">
					<Card className="flex flex-col p-5">
						<span className="mb-3 font-medium">Where visitors come from</span>
						{overview.referrers.length === 0 && (
							<span className="text-sm text-muted-foreground">No sessions yet.</span>
						)}
						{overview.referrers.map((row) => (
							<div key={row.name} className="flex justify-between border-b py-1.5 text-sm last:border-0">
								<span className="truncate">{row.name}</span>
								<span className="tabular-nums text-muted-foreground">{formatNumber(row.count)}</span>
							</div>
						))}
					</Card>
					<Card className="flex flex-col p-5">
						<span className="mb-3 font-medium">Devices</span>
						{overview.devices.map((row) => (
							<div key={row.name} className="flex justify-between border-b py-1.5 text-sm last:border-0">
								<span className="capitalize">{row.name}</span>
								<span className="tabular-nums text-muted-foreground">
									{percent(row.count, overview.totalPageviews)}
								</span>
							</div>
						))}
					</Card>
				</div>
			</div>

			<Card className="flex flex-col gap-5 p-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-col">
						<span className="font-medium">
							<span className="font-mono text-[13px]">{selectedPage}</span> · {formatNumber(page.pageviews)} views
						</span>
						<span className="text-xs text-muted-foreground">Pick a page above to inspect it</span>
					</div>
					{canOpenPage && (
						<div className="flex gap-2 text-sm">
							<a
								href={`${selectedPage}?heatmap=clicks`}
								target="_blank"
								rel="noopener"
								className="rounded-lg bg-[#1c1917] px-3 py-1.5 text-white"
							>
								Click heatmap
							</a>
							<a
								href={`${selectedPage}?heatmap=moves`}
								target="_blank"
								rel="noopener"
								className="rounded-lg border px-3 py-1.5"
							>
								Cursor heatmap
							</a>
						</div>
					)}
				</div>

				<div className="grid gap-6 lg:grid-cols-3">
					<div className="flex flex-col lg:col-span-2">
						<div className="grid grid-cols-[1fr_70px_90px] gap-2 border-b pb-2 text-xs text-muted-foreground">
							<span>What people click</span>
							<span className="text-right">Clicks</span>
							<span className="text-right">Per view</span>
						</div>
						{page.clicks.length === 0 && (
							<span className="py-6 text-sm text-muted-foreground">No clicks recorded.</span>
						)}
						{page.clicks.map((row) => (
							<div key={row.name} className="grid grid-cols-[1fr_70px_90px] gap-2 border-b py-2 text-sm last:border-0">
								<span className="truncate">{row.name}</span>
								<span className="text-right tabular-nums">{formatNumber(row.count)}</span>
								<span className="text-right tabular-nums text-muted-foreground">
									{percent(row.count, page.pageviews)}
								</span>
							</div>
						))}
					</div>
					<div className="flex flex-col gap-3">
						<span className="text-xs text-muted-foreground">How far people scroll</span>
						{page.scroll.map((row) => (
							<div key={row.step} className="flex flex-col gap-1">
								<div className="flex justify-between text-sm">
									<span>{row.step}% of page</span>
									<span className="tabular-nums text-muted-foreground">{percent(row.count, scrollBase)}</span>
								</div>
								<div className="h-2 rounded-full bg-[#f0efee]">
									<div
										className="h-2 rounded-full bg-[#8161FF]"
										style={{ width: scrollBase ? `${(row.count / scrollBase) * 100}%` : "0%" }}
									/>
								</div>
							</div>
						))}
					</div>
				</div>
			</Card>
		</div>
	);
}
