import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoPageView } from "@/components/marketing/seo-page";
import { seoPageBySlug, seoPages } from "@/lib/marketing/seo-pages";

export const dynamicParams = false;

export function generateStaticParams() {
	return seoPages.map((page) => ({ slug: page.slug.split("/") }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const page = seoPageBySlug(slug.join("/"));
	if (!page) return {};
	return {
		title: page.title,
		description: page.description,
		alternates: { canonical: `/${page.slug}` },
		openGraph: {
			title: page.title,
			description: page.description,
			url: `/${page.slug}`,
			type: "article",
		},
		twitter: {
			card: "summary_large_image",
			title: page.title,
			description: page.description,
		},
	};
}

export default async function SeoLandingPage({
	params,
}: {
	params: Promise<{ slug: string[] }>;
}) {
	const { slug } = await params;
	const page = seoPageBySlug(slug.join("/"));
	if (!page) notFound();
	return <SeoPageView page={page} />;
}
