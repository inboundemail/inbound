// ChatGPT Ads Measurement Pixel (https://developers.openai.com/ads/measurement-pixel).
// The pixel is installed sitewide in app/layout.tsx.
export const OPENAI_ADS_PIXEL_ID = "PFMPKjLTZiS9BPd94QD4By";

type Oaiq = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
	interface Window {
		oaiq?: Oaiq;
	}
}

function oaiq(...args: unknown[]) {
	if (typeof window === "undefined") return;
	// Queue calls until the SDK loads (same stub as the install snippet).
	if (!window.oaiq) {
		const queue: Oaiq = (...queued: unknown[]) => {
			queue.q = queue.q || [];
			queue.q.push(queued);
		};
		window.oaiq = queue;
	}
	window.oaiq(...args);
}

/** A paid subscription started (Stripe checkout completed). */
export function measureSubscriptionCreated() {
	oaiq("measure", "subscription_created", { type: "plan_enrollment" });
}

/**
 * Fires subscription_created once when the page was reached from a checkout
 * success URL carrying `param=value`, then removes the success params so a
 * reload doesn't count it again.
 */
export function measureSubscriptionFromSuccessUrl(
	param: string,
	value: string,
	clear: string[] = [param],
): boolean {
	if (typeof window === "undefined") return false;
	const url = new URL(window.location.href);
	if (url.searchParams.get(param) !== value) return false;
	measureSubscriptionCreated();
	for (const key of clear) url.searchParams.delete(key);
	window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
	return true;
}
