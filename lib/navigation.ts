/**
 * Navigation Configuration
 *
 * Centralized navigation system for the application that provides:
 * - Main, secondary, and admin navigation menu items
 * - Dynamic page title generation based on URL paths
 * - Active navigation state management
 * - Role-based access control for admin features
 *
 * Used by components like AppSidebar, NavMain, NavSecondary, and the NavigationContext
 * to provide consistent navigation experience across the application.
 */
import { guardAccessFlag } from "@/app/actions/feature-flags";
import Cloud2 from "@/components/icons/cloud-2";
import Code2 from "@/components/icons/code-2";
import EmailFlow from "@/components/icons/email-flow";
import EnvelopeOpen from "@/components/icons/envelope-open";
import Gear2 from "@/components/icons/gear-2";
import Globe2 from "@/components/icons/globe-2";
import Key2 from "@/components/icons/key-2";
import ShieldCheck from "@/components/icons/shield-check";
import StrokeProjectingCap from "@/components/icons/stroke-projecting-cap";
import UserGroup from "@/components/icons/user-group";

export interface NavigationItem {
	title: string;
	url: string;
	icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	description?: string;
	customTailwind?: string;
	requiresFeatureFlag?: string; // Optional feature flag requirement
}

export interface NavigationConfig {
	main: NavigationItem[];
	secondary: NavigationItem[];
	features: NavigationItem[];
	admin: NavigationItem[];
}

export const navigationConfig: NavigationConfig = {
	main: [
		{
			title: "Email Flow",
			url: "/logs",
			icon: EmailFlow,
			description: "View email flow, delivery status, and routing details",
		},
		{
			title: "Domains and Addresses",
			url: "/emails",
			icon: Globe2,
			description: "Manage your email domains and addresses",
		},
		{
			title: "Mailboxes & SMTP",
			url: "/mailboxes",
			icon: EnvelopeOpen,
			description: "Manage mailbox and SMTP credentials",
		},
		{
			title: "Endpoints",
			url: "/endpoints",
			icon: StrokeProjectingCap,
			description: "Manage webhook and email forwarding endpoints",
		},
		// {
		//   title: "Events",
		//   url: "/events",
		//   icon: Webhook,
		//   description: "View bounces, complaints, and delivery events"
		// },
		{
			title: "API Keys",
			url: "/api-keys",
			icon: Key2,
			description: "Manage API keys for programmatic access",
		},
		{
			title: "Guard",
			url: "/guard",
			icon: ShieldCheck,
			description: "Email security and protection settings",
		},
		{
			title: "Settings",
			url: "/settings",
			icon: Gear2,
			description: "Account and app settings",
		},
	],
	secondary: [],
	features: [],
	admin: [
		{
			title: "Tenants",
			url: "/admin/tenant",
			icon: Cloud2,
			description: "SES tenant monitoring, bounces and complaints",
		},
		{
			title: "Users",
			url: "/admin/users",
			icon: UserGroup,
			description: "User analytics and activity monitoring",
		},
		{
			title: "Lambda Logs",
			url: "/admin/lambda",
			icon: Code2,
			description: "Lambda function monitoring and logs",
		},
	],
};

// Helper function to get page title from URL
export function getPageTitleFromUrl(pathname: string): string {
	// Remove leading slash and split by slash
	const segments = pathname.replace(/^\//, "").split("/");
	const firstSegment = segments[0];

	// Check main navigation items
	const mainItem = navigationConfig.main.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (mainItem) return mainItem.title;

	// Check admin navigation items
	const adminItem = navigationConfig.admin.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (adminItem) return adminItem.title;

	// Check features navigation items
	const featuresItem = navigationConfig.features.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (featuresItem) return featuresItem.title;

	// Check secondary navigation items
	const secondaryItem = navigationConfig.secondary.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (secondaryItem) return secondaryItem.title;

	// Special cases for compound words
	if (firstSegment === "addinbound") return "Add Inbound Email";
	if (firstSegment === "admin") return "Admin Panel";

	// Default fallback - capitalize first segment
	return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

// Helper function to generate document title
export function generateDocumentTitle(
	pageTitle: string,
	baseTitle: string = "inbound",
): string {
	if (pageTitle === "Dashboard") {
		return baseTitle;
	}
	return `${pageTitle} | ${baseTitle}`;
}

// Helper function to get navigation item from URL
export function getNavigationItemFromUrl(
	pathname: string,
): NavigationItem | null {
	const segments = pathname.replace(/^\//, "").split("/");
	const firstSegment = segments[0];

	// Check main navigation items
	const mainItem = navigationConfig.main.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (mainItem) return mainItem;

	// Check admin navigation items
	const adminItem = navigationConfig.admin.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (adminItem) return adminItem;

	// Check features navigation items
	const featuresItem = navigationConfig.features.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (featuresItem) return featuresItem;

	// Check secondary navigation items
	const secondaryItem = navigationConfig.secondary.find(
		(item) => item.url === pathname || item.url === `/${firstSegment}`,
	);
	if (secondaryItem) return secondaryItem;

	return null;
}

/**
 * Check if a navigation item is active based on the current path
 */
export function isNavigationItemActive(
	itemUrl: string,
	currentPath: string,
): boolean {
	// Exact match for root paths
	if (itemUrl === "/" && currentPath === "/") {
		return true;
	}

	// For non-root paths, check if current path starts with the item URL
	if (itemUrl !== "/" && currentPath.startsWith(itemUrl)) {
		return true;
	}

	return false;
}

/**
 * Check if user has admin role
 */
export function isUserAdmin(role?: string): boolean {
	return role === "admin";
}

/**
 * Check if user has a specific feature flag enabled
 */
export function hasFeatureFlag(
	flagName: string,
	featureFlags?: string | null,
): boolean {
	if (!featureFlags) return false;

	try {
		const flags = JSON.parse(featureFlags) as string[];
		return Array.isArray(flags) && flags.includes(flagName);
	} catch {
		return false;
	}
}

/**
 * Filter navigation items based on user's feature flags
 */
export function filterNavigationByFeatureFlags(
	items: NavigationItem[],
	featureFlags?: string | null,
): NavigationItem[] {
	return items.filter((item) => {
		// If no feature flag is required, show the item
		if (!item.requiresFeatureFlag) return true;

		// Check if user has the required feature flag
		return hasFeatureFlag(item.requiresFeatureFlag, featureFlags);
	});
}

/**
 * Check if user has access to Guard feature
 * Server action that can be called from client components
 */
export async function checkGuardAccess(): Promise<boolean> {
	const hasAccess = await guardAccessFlag();
	return hasAccess;
}

/**
 * Filter navigation items based on Guard access
 * Client-side helper that removes Guard if access is disabled
 */
export function filterGuardNavigation(
	items: NavigationItem[],
	hasGuardAccess: boolean,
): NavigationItem[] {
	return items.filter((item) => {
		// Hide Guard if flag is false
		if (item.url === "/guard" && !hasGuardAccess) {
			return false;
		}
		return true;
	});
}
