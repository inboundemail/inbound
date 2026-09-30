import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://inbound.new";

	return {
		name: "inbound - Email Infrastructure Platform",
		short_name: "inbound",
		description:
			"The modern email infrastructure platform for developers. Receive, parse, and manage inbound emails with powerful APIs, webhooks, and real-time processing.",
		start_url: "/",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#1C2894",
		categories: ["productivity", "developer-tools", "business"],
		lang: "en",
		scope: "/",
		orientation: "any",
		icons: [
			{
				src: "/images/icon-light.png",
				sizes: "240x240",
				type: "image/png",
			},
			{
				src: "/favicon.ico",
				sizes: "64x64 32x32 24x24 16x16",
				type: "image/x-icon",
			},
			{
				src: "/apple-touch-icon.png",
				sizes: "180x180",
				type: "image/png",
			},
		],
		shortcuts: [
			{
				name: "Dashboard",
				short_name: "Dashboard",
				description: "Access your email dashboard",
				url: "/logs",
			},
			{
				name: "Add Domain",
				short_name: "Add Domain",
				description: "Add a new email domain",
				url: "/add",
			},
			{
				name: "Documentation",
				short_name: "Docs",
				description: "View API documentation",
				url: "/docs",
			},
		],
	};
}
