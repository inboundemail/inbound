import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://inbound.new";

	return {
		rules: [
			{
				userAgent: "*",
				allow: [
					"/",
					"/pricing",
					"/docs",
					"/blog",
					"/changelog",
					"/privacy",
					"/terms",
				],
				disallow: [
					"/api/",
					"/(main)/*",
					"/actions/",
					"/configure/",
					"/admin/",
					"/analytics/",
					"/emails/",
					"/endpoints/",
					"/logs/",
					"/onboarding/",
					"/settings/",
					"/webhooks/",
					"/add/",
					"/login",
					"/addtoblocklist/",
					"/debug/",
					"/debug-simple/",
					"/development/",
					"/_next/",
					"/test-*",
					"/tmp-files/",
				],
			},
			// Allow search engines to crawl static assets
			{
				userAgent: "*",
				allow: [
					"/*.js",
					"/*.css",
					"/*.png",
					"/*.jpg",
					"/*.jpeg",
					"/*.gif",
					"/*.svg",
					"/*.webp",
					"/*.ico",
				],
			},
		],
		sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/docs/sitemap.xml`],
		host: baseUrl,
	};
}
