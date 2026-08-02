import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://inbound.new";

	return {
		rules: [
			{
				userAgent: "*",
				allow: [
					"/",
					"/improvmx-alternative",
					"/mailgun-inbound-alternative",
					"/sendgrid-inbound-alternative",
					"/postmark-inbound-alternative",
					"/email-as-webhook",
					"/email-webhook-api",
					"/email-parsing-api",
					"/inbound-email-service",
					"/email-api",
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
					"/onboarding",
					"/settings/",
					"/webhooks/",
					"/add/",
					"/login",
					"/addtoblocklist/",
					"/debug/",
					"/debug-simple/",
					"/development/",
					"/vercel-oss-program/",
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
		sitemap: `${baseUrl}/sitemap.xml`,
		host: baseUrl,
	};
}
