"use client";

import { useEffect } from "react";
import {
	HOMEPAGE_EXPERIMENT_NAME,
	type HomepageVariant,
} from "@/lib/homepage-experiment";
import { trackEvent } from "@/lib/utils/visitors";

export function HomepageExperimentTracker({
	variant,
}: {
	variant: HomepageVariant;
}) {
	useEffect(() => {
		const storageKey = `homepage-experiment-viewed:${HOMEPAGE_EXPERIMENT_NAME}:${variant}`;

		const trackView = () => {
			if (window.sessionStorage.getItem(storageKey)) {
				return true;
			}

			if (!window.visitors) {
				return false;
			}

			trackEvent("Homepage Experiment Viewed", {
				experiment: HOMEPAGE_EXPERIMENT_NAME,
				homepage_variant: variant,
			});
			window.sessionStorage.setItem(storageKey, "1");
			return true;
		};

		if (trackView()) {
			return;
		}

		let attempts = 0;
		const interval = window.setInterval(() => {
			if (trackView() || ++attempts >= 40) {
				window.clearInterval(interval);
			}
		}, 250);

		return () => window.clearInterval(interval);
	}, [variant]);

	return null;
}
