export type SeoSection = {
	heading: string;
	paragraphs: string[];
	bullets?: string[];
	code?: { label: string; snippet: string };
};

export type SeoComparisonRow = {
	label: string;
	inbound: string;
	other: string;
};

export type SeoPage = {
	slug: string;
	/** <title>, without the site name. Keep under ~55 characters. */
	title: string;
	/** Meta description, under 155 characters. */
	description: string;
	h1: string;
	intro: string;
	sections: SeoSection[];
	comparison?: {
		competitor: string;
		rows: SeoComparisonRow[];
		note: string;
	};
	faqs: Array<{ question: string; answer: string }>;
	/** Slugs of related pages to link at the bottom. */
	related: string[];
	/** ISO date the content was last reviewed. */
	updated: string;
};
