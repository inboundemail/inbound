"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HeatmapOverlay } from "@/components/analytics/heatmap-overlay";

const VISITOR_KEY = "inbound-vid";
const SESSION_KEY = "inbound-sid";
const OPT_OUT_KEY = "inbound-analytics-optout";
const FLUSH_INTERVAL_MS = 10_000;
const MOVE_SAMPLE_MS = 120;
const HEAT_COLUMNS = 48;
const HEAT_ROW_PX = 24;
const INTERACTIVE =
	'a,button,[role="button"],input[type="submit"],input[type="button"],summary,[data-track]';

type Device = "desktop" | "tablet" | "mobile";
type QueuedEvent =
	| { t: "pv"; p: string; d: Device; entry?: boolean; r?: string }
	| { t: "click"; p: string; d: Device; x: number; y: number; label: string }
	| { t: "scroll"; p: string; d: Device; depth: number };

function randomId() {
	return crypto.randomUUID().replace(/-/g, "");
}

function device(): Device {
	if (window.innerWidth >= 1024) return "desktop";
	if (window.innerWidth >= 640) return "tablet";
	return "mobile";
}

function trackingAllowed() {
	try {
		if (localStorage.getItem(OPT_OUT_KEY) === "1") return false;
	} catch {
		return false;
	}
	const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
	if (nav.globalPrivacyControl || nav.doNotTrack === "1") return false;
	return true;
}

function redact(text: string) {
	return text
		.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
		.replace(/\d{4,}/g, "[number]");
}

function labelFor(target: Element | null) {
	const element = target?.closest(INTERACTIVE);
	if (!element) return "(not a link or button)";
	const explicit =
		element.getAttribute("data-track") || element.getAttribute("aria-label");
	const text = (element as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
	const href = element.getAttribute("href");
	const name = explicit || text || href || element.tagName.toLowerCase();
	const destination = href && href !== name ? ` → ${href.split("?")[0]}` : "";
	return redact(`${name.slice(0, 60)}${destination}`).slice(0, 80);
}

function referrerHost() {
	if (!document.referrer) return undefined;
	try {
		const host = new URL(document.referrer).hostname.replace(/^www\./, "");
		return host === window.location.hostname.replace(/^www\./, "") ? undefined : host;
	} catch {
		return undefined;
	}
}

function createTracker() {
	let visitorId: string;
	let sessionId: string;
	let isEntry = false;
	try {
		visitorId = localStorage.getItem(VISITOR_KEY) || randomId();
		localStorage.setItem(VISITOR_KEY, visitorId);
		const existingSession = sessionStorage.getItem(SESSION_KEY);
		sessionId = existingSession || randomId();
		isEntry = !existingSession;
		sessionStorage.setItem(SESSION_KEY, sessionId);
	} catch {
		visitorId = randomId();
		sessionId = randomId();
	}

	let queue: QueuedEvent[] = [];
	let moveCells: Record<string, Record<string, number>> = {};
	let currentPath = window.location.pathname;
	let maxDepth = 0;

	const flush = (useBeacon = false) => {
		const events: Array<QueuedEvent | { t: "move"; p: string; d: Device; cells: Record<string, number> }> = [
			...queue,
		];
		for (const [key, cells] of Object.entries(moveCells)) {
			const [d, ...pathParts] = key.split("|");
			const limited = Object.fromEntries(Object.entries(cells).slice(0, 400));
			events.push({ t: "move", p: pathParts.join("|"), d: d as Device, cells: limited });
		}
		queue = [];
		moveCells = {};
		if (events.length === 0) return;

		for (let i = 0; i < events.length; i += 60) {
			const body = JSON.stringify({ v: visitorId, s: sessionId, events: events.slice(i, i + 60) });
			if (useBeacon && navigator.sendBeacon) {
				navigator.sendBeacon("/api/analytics/collect", new Blob([body], { type: "text/plain" }));
			} else {
				fetch("/api/analytics/collect", {
					method: "POST",
					body,
					keepalive: true,
					headers: { "Content-Type": "text/plain" },
				}).catch(() => {});
			}
		}
	};

	const recordScroll = () => {
		if (maxDepth > 0) {
			queue.push({ t: "scroll", p: currentPath, d: device(), depth: Math.round(maxDepth) });
		}
		maxDepth = 0;
	};

	const pageview = (path: string) => {
		recordScroll();
		currentPath = path;
		queue.push({
			t: "pv",
			p: path,
			d: device(),
			...(isEntry ? { entry: true, r: referrerHost() } : {}),
		});
		isEntry = false;
		measureScroll();
	};

	const measureScroll = () => {
		const scrollHeight = document.documentElement.scrollHeight;
		if (scrollHeight <= 0) return;
		const depth = ((window.scrollY + window.innerHeight) / scrollHeight) * 100;
		maxDepth = Math.max(maxDepth, Math.min(100, depth));
	};

	const onClick = (event: MouseEvent) => {
		const width = document.documentElement.scrollWidth || window.innerWidth;
		queue.push({
			t: "click",
			p: currentPath,
			d: device(),
			x: Math.min(1, Math.max(0, event.pageX / width)),
			y: Math.max(0, Math.round(event.pageY)),
			label: labelFor(event.target as Element | null),
		});
		if (queue.length >= 50) flush();
	};

	let lastMove = 0;
	const onMove = (event: MouseEvent) => {
		const now = performance.now();
		if (now - lastMove < MOVE_SAMPLE_MS) return;
		lastMove = now;
		const width = document.documentElement.scrollWidth || window.innerWidth;
		const column = Math.min(HEAT_COLUMNS - 1, Math.floor((event.pageX / width) * HEAT_COLUMNS));
		const row = Math.floor(event.pageY / HEAT_ROW_PX);
		const key = `${device()}|${currentPath}`;
		const cells = moveCells[key] ?? {};
		const cell = `${column}:${row}`;
		cells[cell] = (cells[cell] ?? 0) + 1;
		moveCells[key] = cells;
	};

	const onHide = () => {
		if (document.visibilityState === "hidden") {
			recordScroll();
			flush(true);
		}
	};

	document.addEventListener("click", onClick, { capture: true, passive: true });
	document.addEventListener("mousemove", onMove, { passive: true });
	window.addEventListener("scroll", measureScroll, { passive: true });
	document.addEventListener("visibilitychange", onHide);
	const timer = window.setInterval(() => flush(), FLUSH_INTERVAL_MS);

	return {
		pageview,
		destroy: () => {
			recordScroll();
			flush(true);
			window.clearInterval(timer);
			document.removeEventListener("click", onClick, { capture: true });
			document.removeEventListener("mousemove", onMove);
			window.removeEventListener("scroll", measureScroll);
			document.removeEventListener("visibilitychange", onHide);
		},
	};
}

let tracker: ReturnType<typeof createTracker> | null = null;

export function AnalyticsTracker() {
	const pathname = usePathname();
	const [heatmapKind, setHeatmapKind] = useState<"clicks" | "moves" | null>(null);

	useEffect(() => {
		const mode = new URLSearchParams(window.location.search).get("heatmap");
		if (mode === "clicks" || mode === "moves") {
			setHeatmapKind(mode);
			try {
				localStorage.setItem(OPT_OUT_KEY, "1");
			} catch {}
		}
	}, []);

	useEffect(() => {
		if (heatmapKind || pathname.startsWith("/admin") || !trackingAllowed()) return;
		if (!tracker) tracker = createTracker();
		tracker.pageview(pathname);
	}, [pathname, heatmapKind]);

	useEffect(() => {
		return () => {
			tracker?.destroy();
			tracker = null;
		};
	}, []);

	if (!heatmapKind) return null;
	return <HeatmapOverlay path={pathname} initialKind={heatmapKind} />;
}
