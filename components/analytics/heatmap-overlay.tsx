"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HEAT_COLUMNS = 48;
const HEAT_ROW_PX = 24;

type Cell = { column: number; row: number; count: number };
type Kind = "clicks" | "moves";
type Device = "desktop" | "tablet" | "mobile";

function colorRamp() {
	const canvas = document.createElement("canvas");
	canvas.width = 256;
	canvas.height = 1;
	const context = canvas.getContext("2d");
	if (!context) return null;
	const gradient = context.createLinearGradient(0, 0, 256, 0);
	gradient.addColorStop(0.1, "rgb(59,130,246)");
	gradient.addColorStop(0.4, "rgb(34,211,238)");
	gradient.addColorStop(0.6, "rgb(163,230,53)");
	gradient.addColorStop(0.8, "rgb(250,204,21)");
	gradient.addColorStop(1, "rgb(239,68,68)");
	context.fillStyle = gradient;
	context.fillRect(0, 0, 256, 1);
	return context.getImageData(0, 0, 256, 1).data;
}

function draw(canvas: HTMLCanvasElement, cells: Cell[]) {
	const width = document.documentElement.scrollWidth;
	const height = document.documentElement.scrollHeight;
	canvas.width = width;
	canvas.height = height;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	const context = canvas.getContext("2d");
	const ramp = colorRamp();
	if (!context || !ramp || cells.length === 0) return;

	const max = Math.max(...cells.map((cell) => cell.count));
	const radius = Math.max(18, (width / HEAT_COLUMNS) * 1.4);
	for (const cell of cells) {
		const x = ((cell.column + 0.5) / HEAT_COLUMNS) * width;
		const y = (cell.row + 0.5) * HEAT_ROW_PX;
		const alpha = Math.max(0.08, Math.sqrt(cell.count / max));
		const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
		gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
		gradient.addColorStop(1, "rgba(0,0,0,0)");
		context.fillStyle = gradient;
		context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
	}

	const image = context.getImageData(0, 0, width, height);
	const pixels = image.data;
	for (let i = 0; i < pixels.length; i += 4) {
		const intensity = pixels[i + 3];
		if (intensity === 0) continue;
		const offset = intensity * 4;
		pixels[i] = ramp[offset];
		pixels[i + 1] = ramp[offset + 1];
		pixels[i + 2] = ramp[offset + 2];
		pixels[i + 3] = Math.min(200, intensity * 1.4);
	}
	context.putImageData(image, 0, 0);
}

export function HeatmapOverlay({ path, initialKind }: { path: string; initialKind: Kind }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [kind, setKind] = useState<Kind>(initialKind);
	const [days, setDays] = useState(7);
	const [device, setDevice] = useState<Device>("desktop");
	const [cells, setCells] = useState<Cell[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "error">("loading");

	useEffect(() => {
		setStatus("loading");
		const params = new URLSearchParams({ path, kind, days: String(days), device });
		fetch(`/api/analytics/heatmap?${params}`)
			.then(async (response) => {
				if (response.status === 403) return setStatus("forbidden");
				if (!response.ok) return setStatus("error");
				const data = (await response.json()) as { cells: Cell[] };
				setCells(data.cells);
				setStatus("ready");
			})
			.catch(() => setStatus("error"));
	}, [path, kind, days, device]);

	const redraw = useCallback(() => {
		if (canvasRef.current) draw(canvasRef.current, cells);
	}, [cells]);

	useEffect(() => {
		const timer = window.setTimeout(redraw, 600);
		window.addEventListener("resize", redraw);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("resize", redraw);
		};
	}, [redraw]);

	const total = cells.reduce((sum, cell) => sum + cell.count, 0);
	const option = (active: boolean) =>
		`rounded-md px-2 py-1 transition-colors ${active ? "bg-white text-[#1c1917]" : "text-[#d6d3d1] hover:text-white"}`;

	return (
		<>
			<canvas
				ref={canvasRef}
				aria-hidden="true"
				className="pointer-events-none absolute left-0 top-0 z-[9998]"
			/>
			<div className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2 rounded-xl bg-[#1c1917] p-3 text-xs tracking-normal text-white shadow-lg">
				<div className="flex items-center justify-between gap-6">
					<span className="font-medium">Heatmap · {path}</span>
					<a href={path} className="text-[#a8a29e] hover:text-white">
						close
					</a>
				</div>
				<div className="flex gap-1">
					<button type="button" className={option(kind === "clicks")} onClick={() => setKind("clicks")}>
						clicks
					</button>
					<button type="button" className={option(kind === "moves")} onClick={() => setKind("moves")}>
						cursor
					</button>
					<span className="mx-1 w-px bg-[#44403c]" />
					{[7, 30, 90].map((value) => (
						<button key={value} type="button" className={option(days === value)} onClick={() => setDays(value)}>
							{value}d
						</button>
					))}
					<span className="mx-1 w-px bg-[#44403c]" />
					{(["desktop", "mobile"] as const).map((value) => (
						<button key={value} type="button" className={option(device === value)} onClick={() => setDevice(value)}>
							{value}
						</button>
					))}
				</div>
				<span className="text-[#a8a29e]">
					{status === "loading" && "loading…"}
					{status === "forbidden" && "sign in as an admin to view heatmaps"}
					{status === "error" && "could not load heatmap"}
					{status === "ready" &&
						`${total.toLocaleString()} ${kind === "clicks" ? "clicks" : "cursor samples"} · ${device} layout`}
				</span>
			</div>
		</>
	);
}
