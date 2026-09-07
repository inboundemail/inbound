import {
	HOMEPAGE_EXPERIMENT_COOKIE,
	isHomepageVariant,
} from "@/lib/homepage-experiment";

declare global {
	interface Window {
		visitors?: {
			track: (
				event: string,
				properties?: Record<string, string | number | boolean | null>,
			) => void;
			identify: (user: {
				id: string;
				email?: string;
				name?: string;
				[key: string]: string | number | boolean | undefined;
			}) => void;
		};
	}
}

export function trackEvent(
	event: string,
	properties?: Record<string, string | number | boolean | null>,
) {
	if (typeof window !== "undefined" && window.visitors) {
		const homepageVariant = document.cookie
			.split(";")
			.map((cookie) => cookie.trim())
			.find((cookie) => cookie.startsWith(`${HOMEPAGE_EXPERIMENT_COOKIE}=`))
			?.slice(HOMEPAGE_EXPERIMENT_COOKIE.length + 1);

		window.visitors.track(
			event,
			isHomepageVariant(homepageVariant)
				? { homepage_variant: homepageVariant, ...properties }
				: properties,
		);
	}
}

export function identifyUser(user: {
	id: string;
	email?: string;
	name?: string;
	[key: string]: string | number | boolean | undefined;
}) {
	if (typeof window !== "undefined" && window.visitors) {
		window.visitors.identify(user);
	}
}
