import { redis } from "@/lib/redis";

export const HEAT_COLUMNS = 48;
export const HEAT_ROW_PX = 24;
export const DEVICES = ["desktop", "tablet", "mobile"] as const;
export const SCROLL_STEPS = [25, 50, 75, 100] as const;

const RETENTION_SECONDS = 100 * 24 * 60 * 60;
const MAX_LABEL_LENGTH = 80;

export type Device = (typeof DEVICES)[number];
export type HeatKind = "clicks" | "moves";

export type AnalyticsEvent =
	| { t: "pv"; p: string; d: Device; entry?: boolean; r?: string }
	| { t: "click"; p: string; d: Device; x: number; y: number; label?: string }
	| { t: "move"; p: string; d: Device; cells: Record<string, number> }
	| { t: "scroll"; p: string; d: Device; depth: number };

export function dayKey(date: Date) {
	return date.toISOString().slice(0, 10);
}

export function lastDays(count: number, now = new Date()) {
	const days: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		days.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
	}
	return days;
}

const keys = {
	visitors: (day: string) => `an:${day}:visitors`,
	sessions: (day: string) => `an:${day}:sessions`,
	pageviews: (day: string) => `an:${day}:pv`,
	pageVisitors: (day: string, path: string) => `an:${day}:pvu:${path}`,
	referrers: (day: string) => `an:${day}:ref`,
	devices: (day: string) => `an:${day}:device`,
	clicks: (day: string, path: string) => `an:${day}:clicks:${path}`,
	heat: (day: string, kind: HeatKind, path: string, device: Device) =>
		`an:${day}:${kind === "clicks" ? "hc" : "hm"}:${path}:${device}`,
	scroll: (day: string, path: string) => `an:${day}:scroll:${path}`,
};

export function normalizePath(raw: string) {
	const path = raw.split(/[?#]/)[0] || "/";
	if (!path.startsWith("/")) return null;
	const segments = path
		.split("/")
		.filter(Boolean)
		.map((segment) =>
			/^[0-9a-f-]{16,}$/i.test(segment) ||
			(/\d/.test(segment) && segment.length >= 16) ||
			/^\d+$/.test(segment)
				? ":id"
				: segment,
		);
	const normalized = `/${segments.join("/")}`.slice(0, 120);
	return normalized;
}

function heatCell(x: number, y: number) {
	const column = Math.min(HEAT_COLUMNS - 1, Math.max(0, Math.floor(x * HEAT_COLUMNS)));
	const row = Math.max(0, Math.floor(y / HEAT_ROW_PX));
	return `${column}:${row}`;
}

function cleanLabel(label: string | undefined) {
	const cleaned = (label ?? "").replace(/\s+/g, " ").trim();
	return cleaned.slice(0, MAX_LABEL_LENGTH) || "(unlabelled)";
}

export async function recordBatch(input: {
	visitorId: string;
	sessionId: string;
	events: AnalyticsEvent[];
	now?: Date;
}) {
	const day = dayKey(input.now ?? new Date());
	const pipeline = redis.pipeline();
	const touched = new Set<string>();
	const touch = (key: string) => {
		touched.add(key);
		return key;
	};

	pipeline.pfadd(touch(keys.visitors(day)), input.visitorId);
	pipeline.pfadd(touch(keys.sessions(day)), input.sessionId);

	for (const event of input.events) {
		const path = normalizePath(event.p);
		if (!path) continue;

		if (event.t === "pv") {
			pipeline.hincrby(touch(keys.pageviews(day)), path, 1);
			pipeline.pfadd(touch(keys.pageVisitors(day, path)), input.visitorId);
			pipeline.hincrby(touch(keys.devices(day)), event.d, 1);
			if (event.entry) {
				pipeline.hincrby(touch(keys.referrers(day)), event.r || "direct", 1);
			}
		} else if (event.t === "click") {
			pipeline.hincrby(touch(keys.clicks(day, path)), cleanLabel(event.label), 1);
			pipeline.hincrby(
				touch(keys.heat(day, "clicks", path, event.d)),
				heatCell(event.x, event.y),
				1,
			);
		} else if (event.t === "move") {
			const key = touch(keys.heat(day, "moves", path, event.d));
			for (const [cell, count] of Object.entries(event.cells)) {
				if (/^\d{1,2}:\d{1,4}$/.test(cell)) {
					pipeline.hincrby(key, cell, Math.min(50, Math.max(1, Math.round(count))));
				}
			}
		} else if (event.t === "scroll") {
			const key = touch(keys.scroll(day, path));
			for (const step of SCROLL_STEPS) {
				if (event.depth >= step) pipeline.hincrby(key, String(step), 1);
			}
		}
	}

	for (const key of touched) pipeline.expire(key, RETENTION_SECONDS);
	await pipeline.exec();
}

function sumHashes(hashes: Array<Record<string, unknown> | null>) {
	const totals: Record<string, number> = {};
	for (const hash of hashes) {
		if (!hash) continue;
		for (const [field, value] of Object.entries(hash)) {
			totals[field] = (totals[field] ?? 0) + Number(value);
		}
	}
	return totals;
}

function sorted(totals: Record<string, number>, limit = 20) {
	return Object.entries(totals)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name, count]) => ({ name, count }));
}

export async function readOverview(days: string[]) {
	const pipeline = redis.pipeline();
	for (const day of days) pipeline.pfcount(keys.visitors(day));
	for (const day of days) pipeline.pfcount(keys.sessions(day));
	for (const day of days) pipeline.hgetall(keys.pageviews(day));
	for (const day of days) pipeline.hgetall(keys.referrers(day));
	for (const day of days) pipeline.hgetall(keys.devices(day));
	const [firstVisitorsKey, ...otherVisitorsKeys] = days.map(keys.visitors);
	pipeline.pfcount(firstVisitorsKey, ...otherVisitorsKeys);
	const results = (await pipeline.exec()) as unknown[];

	const n = days.length;
	const visitorsByDay = results.slice(0, n).map(Number);
	const sessionsByDay = results.slice(n, 2 * n).map(Number);
	const pageviewHashes = results.slice(2 * n, 3 * n) as Array<Record<string, unknown> | null>;
	const pageviewsByDay = pageviewHashes.map((hash) =>
		Object.values(hash ?? {}).reduce<number>((sum, value) => sum + Number(value), 0),
	);
	const pageTotals = sumHashes(pageviewHashes);
	const referrers = sumHashes(results.slice(3 * n, 4 * n) as Array<Record<string, unknown> | null>);
	const devices = sumHashes(results.slice(4 * n, 5 * n) as Array<Record<string, unknown> | null>);
	const uniqueVisitors = Number(results[5 * n]);

	const topPages = sorted(pageTotals, 25);
	const uniquePipeline = redis.pipeline();
	for (const page of topPages) {
		const [firstKey, ...otherKeys] = days.map((day) => keys.pageVisitors(day, page.name));
		uniquePipeline.pfcount(firstKey, ...otherKeys);
	}
	const pageUniques = topPages.length ? ((await uniquePipeline.exec()) as unknown[]) : [];

	return {
		days: days.map((day, i) => ({
			day,
			visitors: visitorsByDay[i],
			sessions: sessionsByDay[i],
			pageviews: pageviewsByDay[i],
		})),
		uniqueVisitors,
		totalPageviews: pageviewsByDay.reduce((sum, value) => sum + value, 0),
		topPages: topPages.map((page, i) => ({
			path: page.name,
			pageviews: page.count,
			visitors: Number(pageUniques[i] ?? 0),
		})),
		referrers: sorted(referrers, 15),
		devices: sorted(devices, 3),
	};
}

export async function readPage(days: string[], path: string) {
	const pipeline = redis.pipeline();
	for (const day of days) pipeline.hgetall(keys.clicks(day, path));
	for (const day of days) pipeline.hgetall(keys.scroll(day, path));
	for (const day of days) pipeline.hget(keys.pageviews(day), path);
	const results = (await pipeline.exec()) as unknown[];
	const n = days.length;
	const clicks = sumHashes(results.slice(0, n) as Array<Record<string, unknown> | null>);
	const scroll = sumHashes(results.slice(n, 2 * n) as Array<Record<string, unknown> | null>);
	const pageviews = results
		.slice(2 * n, 3 * n)
		.reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
	return {
		pageviews,
		clicks: sorted(clicks, 30),
		scroll: SCROLL_STEPS.map((step) => ({ step, count: scroll[String(step)] ?? 0 })),
	};
}

export async function readHeatmap(
	days: string[],
	kind: HeatKind,
	path: string,
	device: Device,
) {
	const pipeline = redis.pipeline();
	for (const day of days) pipeline.hgetall(keys.heat(day, kind, path, device));
	const totals = sumHashes((await pipeline.exec()) as Array<Record<string, unknown> | null>);
	return Object.entries(totals).map(([cell, count]) => {
		const [column, row] = cell.split(":").map(Number);
		return { column, row, count };
	});
}
