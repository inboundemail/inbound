import { glob } from "glob";
import type { MetadataRoute } from "next";
import { resolve } from "path";

async function getChangelogEntries() {
	try {
		const changelogDir = resolve(process.cwd(), "app/changelog/entries");
		const files = await glob("*.mdx", { cwd: changelogDir });
		return files.map((file) => file.replace(".mdx", ""));
	} catch (error) {
		console.warn("Could not read changelog entries:", error);
		return [];
	}
}

async function getBlogPosts() {
	try {
		const { getBlogPostsSorted } = await import(
			"@/features/blog/utils/blog-posts"
		);
		const blogPosts = await getBlogPostsSorted();

		return blogPosts.map((blog) => blog.slug);
	} catch (error) {
		console.warn("Could not read blog posts:", error);
		return [];
	}
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://inbound.new";

	// Get dynamic content
	const changelogEntries = await getChangelogEntries();
	const blogPosts = await getBlogPosts();

	const staticPages = [
		// Homepage - highest priority
		{
			url: `${baseUrl}/`,
			lastModified: new Date(),
			changeFrequency: "weekly" as const,
			priority: 1.0,
		},

		// Core product pages
		{
			url: `${baseUrl}/pricing`,
			lastModified: new Date(),
			changeFrequency: "weekly" as const,
			priority: 0.8,
		},
		{
			url: `${baseUrl}/docs`,
			lastModified: new Date(),
			changeFrequency: "weekly" as const,
			priority: 0.8,
		},

		// Secondary pages
		{
			url: `${baseUrl}/login`,
			lastModified: new Date(),
			changeFrequency: "monthly" as const,
			priority: 0.6,
		},
		{
			url: `${baseUrl}/changelog`,
			lastModified: new Date(),
			changeFrequency: "weekly" as const,
			priority: 0.7,
		},
		{
			url: `${baseUrl}/blog`,
			lastModified: new Date(),
			changeFrequency: "weekly" as const,
			priority: 0.7,
		},

		// Legal pages
		{
			url: `${baseUrl}/privacy`,
			lastModified: new Date(),
			changeFrequency: "yearly" as const,
			priority: 0.3,
		},
		{
			url: `${baseUrl}/terms`,
			lastModified: new Date(),
			changeFrequency: "yearly" as const,
			priority: 0.3,
		},
	];

	// Add changelog entries
	const changelogPages = changelogEntries.map((entry) => ({
		url: `${baseUrl}/changelog/${entry}`,
		lastModified: new Date(),
		changeFrequency: "never" as const,
		priority: 0.5,
	}));

	// Add blog posts
	const blogPages = blogPosts.map((post) => ({
		url: `${baseUrl}/blog/${post}`,
		lastModified: new Date(),
		changeFrequency: "monthly" as const,
		priority: 0.6,
	}));

	return [...staticPages, ...changelogPages, ...blogPages];
}
