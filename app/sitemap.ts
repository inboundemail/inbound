import type { MetadataRoute } from "next";
import { getBlogPostsSorted } from "@/features/blog/utils/blog-posts";
import { seoPages } from "@/lib/marketing/seo-pages";

const baseUrl = "https://inbound.new";

const staticPaths = [
	"/",
	"/pricing",
	"/features",
	"/blog",
	"/security",
	"/privacy",
	"/terms",
	"/avatar-api",
	"/bimi-generator",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const blogPosts = await getBlogPostsSorted();

	return [
		...staticPaths.map((pathname) => ({ url: `${baseUrl}${pathname}` })),
		...seoPages.map((page) => ({
			url: `${baseUrl}/${page.slug}`,
			lastModified: new Date(page.updated),
		})),
		...blogPosts.map((post) => ({
			url: `${baseUrl}/blog/${post.slug}`,
			...(post.date ? { lastModified: new Date(post.date) } : {}),
		})),
	];
}
