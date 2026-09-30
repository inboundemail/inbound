import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { MetadataRoute } from "next";
import { getBlogPostsSorted } from "@/features/blog/utils/blog-posts";
import { seoPages } from "@/lib/marketing/seo-pages";

const baseUrl = "https://inbound.new";

const staticPaths = [
	"/",
	"/pricing",
	"/features",
	"/blog",
	"/changelog",
	"/security",
	"/privacy",
	"/terms",
	"/avatar-api",
	"/bimi-generator",
];

async function changelogEntries(): Promise<MetadataRoute.Sitemap> {
	const dir = path.join(process.cwd(), "app/changelog/entries");
	const files = (await readdir(dir).catch(() => [])).filter((file) =>
		file.endsWith(".mdx"),
	);
	return Promise.all(
		files.map(async (file) => {
			const { data } = matter(await readFile(path.join(dir, file), "utf8"));
			return {
				url: `${baseUrl}/changelog/${file.replace(/\.mdx$/, "")}`,
				...(data.date ? { lastModified: new Date(data.date) } : {}),
			};
		}),
	);
}

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
		...(await changelogEntries()),
	];
}
