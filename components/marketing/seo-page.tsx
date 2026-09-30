import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/marketing-nav";
import { seoPageBySlug } from "@/lib/marketing/seo-pages";
import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export function SeoPageView({ page }: { page: SeoPage }) {
	const related = page.related
		.map((slug) => seoPageBySlug(slug))
		.filter((item): item is SeoPage => !!item);

	return (
		<div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
			<div className="max-w-2xl mx-auto px-6">
				<MarketingNav />

				<section className="pt-20 pb-12">
					<h1 className="font-heading text-[32px] leading-[1.2] tracking-tight mb-3">
						{page.h1}
					</h1>
					<p className="text-[#52525b] leading-relaxed">{page.intro}</p>
					<div className="flex items-center gap-3 mt-6">
						<Link
							href="/login"
							className="bg-[#8161FF] hover:bg-[#6b4fd9] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
						>
							Get started
						</Link>
						<Link
							href="/docs"
							className="bg-white border border-[#e7e5e4] hover:border-[#d6d3d1] text-[#1c1917] px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
						>
							Read the docs
						</Link>
					</div>
				</section>

				{page.sections.map((section) => (
					<section
						key={section.heading}
						className="py-10 border-t border-[#e7e5e4]"
					>
						<h2 className="font-heading text-xl font-semibold tracking-tight mb-4">
							{section.heading}
						</h2>
						<div className="space-y-4 text-[#3f3f46] leading-relaxed">
							{section.paragraphs.map((paragraph) => (
								<p key={paragraph}>{paragraph}</p>
							))}
						</div>
						{section.bullets && (
							<ul className="mt-4 space-y-2 text-sm text-[#3f3f46]">
								{section.bullets.map((bullet) => (
									<li key={bullet} className="flex gap-3">
										{!/^\d+\./.test(bullet) && (
											<span className="text-[#8161FF]">•</span>
										)}
										<span>{bullet}</span>
									</li>
								))}
							</ul>
						)}
						{section.code && (
							<figure className="mt-5">
								<figcaption className="text-xs text-[#78716c] mb-2">
									{section.code.label}
								</figcaption>
								<pre className="bg-white border border-[#e7e5e4] rounded-xl p-4 text-[13px] leading-relaxed overflow-x-auto font-mono text-[#1c1917]">
									<code>{section.code.snippet}</code>
								</pre>
							</figure>
						)}
					</section>
				))}

				{page.comparison && (
					<section className="py-10 border-t border-[#e7e5e4]">
						<h2 className="font-heading text-xl font-semibold tracking-tight mb-4">
							inbound vs {page.comparison.competitor}
						</h2>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-[#78716c] border-b border-[#e7e5e4]">
										<th className="py-2 pr-4 font-medium" />
										<th className="py-2 pr-4 font-medium">inbound</th>
										<th className="py-2 font-medium">
											{page.comparison.competitor}
										</th>
									</tr>
								</thead>
								<tbody>
									{page.comparison.rows.map((row) => (
										<tr
											key={row.label}
											className="border-b border-[#e7e5e4] align-top"
										>
											<td className="py-3 pr-4 font-medium text-[#1c1917]">
												{row.label}
											</td>
											<td className="py-3 pr-4 text-[#3f3f46]">
												{row.inbound}
											</td>
											<td className="py-3 text-[#3f3f46]">{row.other}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<p className="text-xs text-[#78716c] mt-3">
							{page.comparison.note}
						</p>
					</section>
				)}

				{page.faqs.length > 0 && (
					<section className="py-10 border-t border-[#e7e5e4]">
						<h2 className="font-heading text-xl font-semibold tracking-tight mb-4">
							Questions
						</h2>
						<div>
							{page.faqs.map((faq) => (
								<details
									key={faq.question}
									className="py-4 border-b border-[#e7e5e4] group"
								>
									<summary className="cursor-pointer font-medium text-[#1c1917] list-none flex justify-between gap-4">
										{faq.question}
										<span className="text-[#a8a29e] group-open:rotate-45 transition-transform">
											+
										</span>
									</summary>
									<p className="text-sm text-[#52525b] mt-2 leading-relaxed">
										{faq.answer}
									</p>
								</details>
							))}
						</div>
					</section>
				)}

				{related.length > 0 && (
					<section className="py-10 border-t border-[#e7e5e4]">
						<h2 className="font-heading text-xl font-semibold tracking-tight mb-4">
							Related
						</h2>
						<ul className="space-y-2 text-sm">
							{related.map((item) => (
								<li key={item.slug}>
									<Link
										href={`/${item.slug}`}
										className="text-[#8161FF] hover:underline"
									>
										{item.h1}
									</Link>
								</li>
							))}
						</ul>
					</section>
				)}

				<section className="py-12 border-t border-[#e7e5e4] text-center">
					<h2 className="font-heading text-xl font-semibold tracking-tight mb-2">
						Start receiving email in minutes
					</h2>
					<p className="text-[#52525b] mb-6">
						Add a domain, point an address at your webhook, and get structured
						JSON for every message.
					</p>
					<Link
						href="/login"
						className="bg-[#8161FF] hover:bg-[#6b4fd9] text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
					>
						Get started
					</Link>
				</section>

				<MarketingFooter />
			</div>
		</div>
	);
}
