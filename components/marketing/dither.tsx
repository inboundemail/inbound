"use client";

import { useEffect, useRef } from "react";

type Scene = "horizon" | "rowfill" | "step" | "rail";

type SceneInput = {
	x: number;
	y: number;
	w: number;
	h: number;
	t: number;
	seed: number;
	level: number;
	apexY: number;
	radius: number;
	clear: boolean;
	fadeBottom: number;
};

type DitherProps = {
	scene: Scene;
	className?: string;
	cell?: number;
	seed?: number;
	level?: number;
	apex?: number;
	radius?: number;
	anchored?: boolean;
	anchorOffset?: number;
	clear?: boolean;
	fadeBottom?: number;
};

const PURPLE = [129, 97, 255];
const FRAME_MS = 33;

const BAYER = (() => {
	let m = [
		[0, 2],
		[3, 1],
	];
	while (m.length < 8) {
		const n = m.length;
		const next = Array.from({ length: n * 2 }, () =>
			new Array<number>(n * 2).fill(0),
		);
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				const v = 4 * m[y][x];
				next[y][x] = v;
				next[y][x + n] = v + 2;
				next[y + n][x] = v + 3;
				next[y + n][x + n] = v + 1;
			}
		}
		m = next;
	}
	return Float32Array.from(m.flat(), (v) => (v + 0.5) / 64);
})();

function smoothstep(edge0: number, edge1: number, value: number) {
	const k = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
	return k * k * (3 - 2 * k);
}

function horizon({
	x,
	y,
	w,
	h,
	t,
	apexY,
	radius,
	clear,
	fadeBottom,
}: SceneInput) {
	const rise = 1 - (1 - Math.min(t / 2.4, 1)) ** 3;
	const r = Math.max(w * radius, 480);
	const top = h + 80 - (h + 80 - apexY) * rise;
	const d = Math.hypot(x - w / 2, y - top - r);
	const breathe = 1 + 0.1 * Math.sin(t * 0.6);
	let v: number;
	if (d > r) {
		const o = d - r;
		v =
			Math.exp(-((o / (70 * breathe)) ** 2)) +
			0.55 * Math.exp(-((o / (260 * breathe)) ** 2));
		if (clear) v *= smoothstep(top - 250, top - 50, y);
	} else {
		const i = r - d;
		v = 0.9 * Math.exp(-i / 50) + 0.06 * Math.exp(-i / 400);
	}
	v = Math.min(v, 1) ** 1.15 * Math.min(y / 140, 1) ** 1.5;
	return fadeBottom > 0 ? v * smoothstep(h, h - fadeBottom, y) : v;
}

function rowfill({ x, w, t }: SceneInput) {
	const r = Math.max(0, (x / w - 0.62) / 0.38);
	return r ** 1.6 * (0.55 + 0.06 * Math.sin(x * 0.04 - t * 1.6));
}

function step({ x, y, w, h, level }: SceneInput) {
	return level * (0.55 + 0.45 * (1 - (x + y) / (w + h)));
}

function rail({ y, h, t, seed }: SceneInput) {
	const pulse = ((t * 160 + seed * 220) % (h + 300)) - 150;
	const head = Math.exp(-(((y - pulse) / 60) ** 2));
	const trail = y < pulse ? 0.45 * Math.exp((y - pulse) / 160) : 0;
	return 0.22 + 0.8 * head + trail;
}

const SCENES: Record<Scene, (input: SceneInput) => number> = {
	horizon,
	rowfill,
	step,
	rail,
};

const ANIMATED: Record<Scene, boolean> = {
	horizon: true,
	rowfill: true,
	step: false,
	rail: true,
};

export function Dither({
	scene,
	className,
	cell = 4,
	seed = 0,
	level = 0.6,
	apex = 0.6,
	radius = 0.875,
	anchored = false,
	anchorOffset = 0,
	clear = false,
	fadeBottom = 0,
}: DitherProps) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const field = SCENES[scene];
		const still =
			!ANIMATED[scene] ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const anchorElement = anchored
			? canvas.parentElement?.querySelector<HTMLElement>("[data-dither-anchor]")
			: null;
		const input: SceneInput = {
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			t: 0,
			seed,
			level,
			apexY: 0,
			radius,
			clear,
			fadeBottom,
		};
		let gw = 1;
		let gh = 1;
		let image: ImageData | null = null;
		let start: number | null = null;
		let visible = false;
		let frame = 0;
		let last = 0;

		const clock = () =>
			still ? 60 : start === null ? 0 : (performance.now() - start) / 1000;

		const draw = () => {
			if (!image) return;
			const data = image.data;
			input.t = clock();
			for (let gy = 0; gy < gh; gy++) {
				input.y = ((gy + 0.5) * input.h) / gh;
				for (let gx = 0; gx < gw; gx++) {
					input.x = ((gx + 0.5) * input.w) / gw;
					const i = (gy * gw + gx) * 4;
					data[i] = PURPLE[0];
					data[i + 1] = PURPLE[1];
					data[i + 2] = PURPLE[2];
					data[i + 3] = field(input) > BAYER[(gy & 7) * 8 + (gx & 7)] ? 255 : 0;
				}
			}
			ctx.putImageData(image, 0, 0);
		};

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			input.w = Math.max(rect.width, 1);
			input.h = Math.max(rect.height, 1);
			gw = Math.max(1, Math.round(input.w / cell));
			gh = Math.max(1, Math.round(input.h / cell));
			input.apexY = anchorElement
				? anchorElement.getBoundingClientRect().top - rect.top + anchorOffset
				: input.h * apex;
			canvas.width = gw;
			canvas.height = gh;
			image = ctx.createImageData(gw, gh);
			draw();
		};

		const loop = (now: number) => {
			frame = requestAnimationFrame(loop);
			if (!visible || now - last < FRAME_MS) return;
			last = now;
			draw();
		};

		const resizeObserver = new ResizeObserver(resize);
		const visibilityObserver = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible && start === null) start = performance.now();
		});
		resizeObserver.observe(canvas);
		if (anchorElement) resizeObserver.observe(anchorElement);
		visibilityObserver.observe(canvas);
		resize();
		if (!still) frame = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			visibilityObserver.disconnect();
		};
	}, [
		scene,
		cell,
		seed,
		level,
		apex,
		radius,
		anchored,
		anchorOffset,
		clear,
		fadeBottom,
	]);

	return (
		<canvas
			ref={ref}
			aria-hidden="true"
			className={className}
			style={{ imageRendering: "pixelated" }}
		/>
	);
}
