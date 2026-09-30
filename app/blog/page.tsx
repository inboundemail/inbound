import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/marketing-nav";
import { getBlogPostsSorted } from "@/features/blog/utils/blog-posts";

export const metadata: Metadata = {
  title: "Blog",
  description: "Product updates, guides, and engineering notes from the inbound team.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
	const blogs = await getBlogPostsSorted();

	return (
		<div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
			<div className="max-w-2xl mx-auto px-6">
				<MarketingNav />

				{/* Hero */}
				<section className="pt-20 pb-12">
					<h1 className="font-heading text-[32px] leading-[1.2] tracking-tight mb-2">
						Blog
					</h1>
					<p className="text-[#52525b] leading-relaxed">
						Stay updated with the latest news and updates from inbound.
					</p>
				</section>

				{/* Blog posts */}
				<section className="py-8 border-t border-[#e7e5e4]">
					{blogs.length === 0 ? (
						<div className="text-center py-12">
							<p className="text-[#52525b]">No blog posts found.</p>
						</div>
					) : (
						<div className="space-y-0">
							{blogs.map((blog) => (
								<Link
									key={blog.id}
									href={`/blog/${blog.slug}`}
									className="block py-4 border-b border-[#e7e5e4] hover:bg-white/50 transition-colors group"
								>
									<div className="flex items-center justify-between">
										<div className="min-w-0 flex-1">
											<p className="text-[#1c1917] font-medium group-hover:text-[#8161FF] transition-colors">
												{blog.title}
											</p>
											{blog.description && (
												<p className="text-sm text-[#52525b] mt-1 line-clamp-1">
													{blog.description}
												</p>
											)}
										</div>
										{blog.date && (
											<span className="text-sm text-[#78716c] ml-4 flex-shrink-0">
												{new Date(blog.date).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})}
											</span>
										)}
									</div>
								</Link>
							))}
						</div>
					)}
				</section>

				<MarketingFooter />
			</div>
		</div>
	);
}
