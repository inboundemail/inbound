export type HomepageContent = {
	_title: string;
	heroPrimaryText: string;
	heroSublineText: string;
	ctaButtonPrimaryText: string;
};

const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
	_title: "inbound",
	heroPrimaryText:
		"email infrastructure built for agent inboxes, webhooks, and automated workflows.",
	heroSublineText:
		"send, receive, and reply in thread through one simple api & cli.",
	ctaButtonPrimaryText: "Get Started",
};

export async function getHomepageContent() {
	return {
		success: true,
		data: DEFAULT_HOMEPAGE_CONTENT,
	};
}
