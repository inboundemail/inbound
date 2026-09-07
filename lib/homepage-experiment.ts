export const HOMEPAGE_EXPERIMENT_COOKIE = "inbound_homepage_variant";
export const HOMEPAGE_EXPERIMENT_NAME = "homepage-redesign";

export type HomepageVariant = "control" | "redesign";

export function isHomepageVariant(
	value: string | null | undefined,
): value is HomepageVariant {
	return value === "control" || value === "redesign";
}
