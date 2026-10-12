"use client";

import { useEffect, useRef } from "react";

type Scene = "horizon" | "debris" | "tear" | "rowfill" | "step";

type SceneInput = {
	x: number;
	y: number;
	gx: number;
	gy: number;
	gw: number;
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
	interactive?: boolean;
};

const PURPLE = [129, 97, 255];
const FRAME_MS = 33;
const SPOTLIGHT_RADIUS = 120;

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

function hash(x: number, y: number, s: number) {
	const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
	return h - Math.floor(h);
}

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
	const breathe = 1 + 0.14 * Math.sin(t * 0.7);
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
	v +=
		0.08 *
		Math.sin(x * 0.012 + t * 0.9) *
		Math.sin(y * 0.03 - t * 0.6) *
		Math.min(v * 3, 1);
	v = Math.min(Math.max(v, 0), 1) ** 1.15 * Math.min(y / 140, 1) ** 1.5;
	return fadeBottom > 0 ? v * smoothstep(h, h - fadeBottom, y) : v;
}

function debris({ x, y, gx, gy, w, h, t, seed }: SceneInput) {
	let v = 0;
	for (let i = 0; i < 3; i++) {
		const bx =
			w * (0.2 + 0.6 * hash(i, 1, seed)) + Math.sin(t * 0.4 + i * 2) * 10;
		const by = h * (0.2 + 0.6 * hash(i, 2, seed)) + Math.cos(t * 0.3 + i) * 5;
		const sx = 14 + 26 * hash(i, 3, seed);
		const sy = 6 + 12 * hash(i, 4, seed);
		v +=
			Math.exp(-(((x - bx) / sx) ** 2 + ((y - by) / sy) ** 2)) *
			(0.3 + 0.45 * hash(i, 5, seed));
	}
	return v + (hash(gx, gy, seed + Math.floor(t * 3)) - 0.5) * 0.24;
}

function tear({ gx, gy, gw, t, seed }: SceneInput) {
	const tick = Math.floor(t / 1.4);
	if (hash(gy, tick, seed) > 0.6) return 0;
	const start = hash(gy, tick, seed + 1) * gw * 0.85;
	const length = 8 + hash(gy, tick, seed + 2) * 52;
	return gx >= start && gx < start + length
		? 0.4 + 0.6 * hash(gy, tick, seed + 3)
		: 0;
}

function rowfill({ x, w, t }: SceneInput) {
	const r = Math.max(0, (x / w - 0.62) / 0.38);
	return r ** 1.6 * (0.55 + 0.1 * Math.sin(x * 0.04 - t * 2.2));
}

function step({ x, y, w, h, t, seed, level }: SceneInput) {
	return (
		level *
		(0.55 + 0.45 * (1 - (x + y) / (w + h))) *
		(0.92 + 0.08 * Math.sin(t * 1.4 + seed))
	);
}

const SCENES: Record<Scene, (input: SceneInput) => number> = {
	horizon,
	debris,
	tear,
	rowfill,
	step,
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
	interactive = false,
}: DitherProps) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const field = SCENES[scene];
		const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const anchorElement = anchored
			? canvas.parentElement?.querySelector<HTMLElement>("[data-dither-anchor]")
			: null;
		const input: SceneInput = {
			x: 0,
			y: 0,
			gx: 0,
			gy: 0,
			gw: 1,
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
		const pointer = { x: 0, y: 0, active: false };
		const light = { x: 0, y: 0, strength: 0 };
		let baseApex = 0;
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
			const rect = canvas.getBoundingClientRect();
			input.t = clock();
			input.apexY =
				baseApex -
				(still ? 0 : Math.min(Math.max(-rect.top, 0), input.h) * 0.2);
			if (interactive) {
				const target = pointer.active ? 1 : 0;
				if (light.strength < 0.01) {
					light.x = pointer.x - rect.left;
					light.y = pointer.y - rect.top;
				}
				light.strength += (target - light.strength) * 0.12;
				light.x += (pointer.x - rect.left - light.x) * 0.18;
				light.y += (pointer.y - rect.top - light.y) * 0.18;
			}
			const lit = interactive && light.strength > 0.01;
			for (let gy = 0; gy < gh; gy++) {
				input.gy = gy;
				input.y = ((gy + 0.5) * input.h) / gh;
				for (let gx = 0; gx < input.gw; gx++) {
					input.gx = gx;
					input.x = ((gx + 0.5) * input.w) / input.gw;
					let v = field(input);
					if (lit) {
						const dx = (input.x - light.x) / SPOTLIGHT_RADIUS;
						const dy = (input.y - light.y) / SPOTLIGHT_RADIUS;
						v += 0.34 * light.strength * Math.exp(-(dx * dx + dy * dy));
					}
					const i = (gy * input.gw + gx) * 4;
					data[i] = PURPLE[0];
					data[i + 1] = PURPLE[1];
					data[i + 2] = PURPLE[2];
					data[i + 3] = v > BAYER[(gy & 7) * 8 + (gx & 7)] ? 255 : 0;
				}
			}
			ctx.putImageData(image, 0, 0);
		};

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			input.w = Math.max(rect.width, 1);
			input.h = Math.max(rect.height, 1);
			input.gw = Math.max(1, Math.round(input.w / cell));
			gh = Math.max(1, Math.round(input.h / cell));
			baseApex = anchorElement
				? anchorElement.getBoundingClientRect().top - rect.top + anchorOffset
				: input.h * apex;
			canvas.width = input.gw;
			canvas.height = gh;
			image = ctx.createImageData(input.gw, gh);
			draw();
		};

		const loop = (now: number) => {
			frame = requestAnimationFrame(loop);
			if (!visible || now - last < FRAME_MS) return;
			last = now;
			draw();
		};

		const onPointerMove = (event: PointerEvent) => {
			if (event.pointerType !== "mouse") return;
			pointer.x = event.clientX;
			pointer.y = event.clientY;
			pointer.active = true;
		};
		const onPointerLeave = () => {
			pointer.active = false;
		};

		const resizeObserver = new ResizeObserver(resize);
		const visibilityObserver = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible && start === null) start = performance.now();
			if (still && visible) draw();
		});
		resizeObserver.observe(canvas);
		if (anchorElement) resizeObserver.observe(anchorElement);
		visibilityObserver.observe(canvas);
		if (interactive && !still) {
			window.addEventListener("pointermove", onPointerMove, { passive: true });
			document.documentElement.addEventListener("pointerleave", onPointerLeave);
		}
		resize();
		if (!still) frame = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			visibilityObserver.disconnect();
			window.removeEventListener("pointermove", onPointerMove);
			document.documentElement.removeEventListener(
				"pointerleave",
				onPointerLeave,
			);
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
		interactive,
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
