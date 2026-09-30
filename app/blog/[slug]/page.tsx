import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { MarketingFooter, MarketingNav } from "@/components/marketing-nav";
import { getBlogPostsSorted } from "@/features/blog/utils/blog-posts";

interface BlogPostPageProps {
	params: Promise<{
		slug: string;
	}>;
}

export async function generateStaticParams() {
	const blogPosts = await getBlogPostsSorted();

	return blogPosts.map((blogPost) => ({
		slug: blogPost.slug,
	}));
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
	const { slug } = await params;
	const blogPosts = await getBlogPostsSorted();
	const currentIndex = blogPosts.findIndex(
		(blogPost) => blogPost.slug === slug,
	);

	if (currentIndex === -1) {
		notFound();
	}

	const blog = blogPosts[currentIndex];

	if (!blog) {
		notFound();
	}

	const previousPost =
		currentIndex < blogPosts.length - 1
			? blogPosts[currentIndex + 1]
			: undefined;
	const nextPost = currentIndex > 0 ? blogPosts[currentIndex - 1] : undefined;

	return (
		<div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
			<div className="max-w-2xl mx-auto px-6">
				<MarketingNav />

				{/* Content */}
				<article>
					{/* Back link */}
					<div className="pt-8 pb-4">
						<Link
							href="/blog"
							className="inline-flex items-center gap-2 text-sm text-[#52525b] hover:text-[#1c1917] transition-colors"
						>
							← All posts
						</Link>
					</div>

					{/* Article header */}
					<header className="pb-8 border-b border-[#e7e5e4]">
						{blog.date && (
							<p className="text-sm text-[#78716c] mb-3">
								{new Date(blog.date).toLocaleDateString("en-US", {
									year: "numeric",
									month: "long",
									day: "numeric",
								})}
							</p>
						)}

						<h1 className="font-heading text-[32px] leading-[1.2] tracking-tight text-[#1c1917] mb-4">
							{blog.title}
						</h1>

						{blog.description && (
							<p className="text-lg text-[#52525b] leading-relaxed mb-6">
								{blog.description}
							</p>
						)}

						{(blog.authorImage?.url ||
							blog.authorName ||
							blog.authorPosition) && (
							<div className="flex items-center gap-3">
								{blog.authorImage?.url && (
									<Image
										src={blog.authorImage.url}
										alt={blog.authorName || "Blog author"}
										width={40}
										height={40}
										className="rounded-full h-10 w-10 object-cover"
										unoptimized
									/>
								)}
								<div>
									{blog.authorName && (
										<p className="font-medium text-[#1c1917]">
											{blog.authorName}
										</p>
									)}
									{blog.authorPosition && (
										<p className="text-sm text-[#78716c]">
											{blog.authorPosition}
										</p>
									)}
								</div>
							</div>
						)}
					</header>

					{/* Featured image */}
					{blog.image?.url && (
						<div className="py-8">
							<div className="w-full bg-[#f5f5f4] rounded-xl overflow-hidden">
								<Image
									src={blog.image.url}
									alt={blog.title}
									width={1600}
									height={900}
									className="w-full h-auto"
									unoptimized
								/>
							</div>
						</div>
					)}

					{/* Article content */}
					<div className="py-8 prose prose-stone max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-a:text-[#8161FF] prose-a:no-underline hover:prose-a:underline">
						{blog.content ? (
							<MDXRemote source={blog.content} />
						) : (
							<p className="text-[#78716c]">
								Content not available for this blog post.
							</p>
						)}
					</div>

					{/* Navigation */}
					<div className="py-8 border-t border-[#e7e5e4]">
						<div className="flex items-center justify-between">
							{previousPost ? (
								<Link
									href={`/blog/${previousPost.slug}`}
									className="flex items-center gap-2 text-sm text-[#52525b] hover:text-[#1c1917] transition-colors"
								>
									←{" "}
									<span className="max-w-[200px] truncate">
										{previousPost.title}
									</span>
								</Link>
							) : (
								<div />
							)}
							{nextPost ? (
								<Link
									href={`/blog/${nextPost.slug}`}
									className="flex items-center gap-2 text-sm text-[#52525b] hover:text-[#1c1917] transition-colors"
								>
									<span className="max-w-[200px] truncate">
										{nextPost.title}
									</span>{" "}
									→
								</Link>
							) : (
								<div />
							)}
						</div>
					</div>
				</article>

				<MarketingFooter />
			</div>
		</div>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const blogPosts = await getBlogPostsSorted();
	const blog = blogPosts.find((blogPost) => blogPost.slug === slug);

	if (!blog) {
		return {
			title: "Blog",
		};
	}

	const imageUrl = blog.image?.url || "/opengraph-image.png";

	return {
		title: blog.title,
		description: blog.description,
		alternates: { canonical: `/blog/${slug}` },
		openGraph: {
			title: blog.title,
			description: blog.description,
			images: [{ url: imageUrl }],
		},
		twitter: {
			card: "summary_large_image",
			title: blog.title,
			description: blog.description,
			images: [imageUrl],
		},
	};
}
