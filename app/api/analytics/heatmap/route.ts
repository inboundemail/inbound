import { headers } from "next/headers";
import { DEVICES, type Device, lastDays, normalizePath, readHeatmap } from "@/lib/analytics/store";
import { auth } from "@/lib/auth/auth";

export async function GET(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
	if (session?.user?.role !== "admin") {
		return Response.json({ error: "Admin access required" }, { status: 403 });
	}

	const url = new URL(request.url);
	const path = normalizePath(url.searchParams.get("path") ?? "/");
	const kind = url.searchParams.get("kind") === "moves" ? "moves" : "clicks";
	const deviceParam = url.searchParams.get("device") ?? "desktop";
	const device: Device = (DEVICES as readonly string[]).includes(deviceParam)
		? (deviceParam as Device)
		: "desktop";
	const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));

	if (!path) return Response.json({ error: "Invalid path" }, { status: 400 });

	const cells = await readHeatmap(lastDays(days), kind, path, device);
	return Response.json({ path, kind, device, days, cells });
}
