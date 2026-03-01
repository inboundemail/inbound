/**
 * Helper functions for handling special agent@inbnd.dev email address
 * This email can be used by any user for sending emails through the v2 APIs
 */

import { extractDomainFromEmail, extractEmailAddress } from "@/lib/utils/email-utils";

// Re-export shared utilities so existing callers don't break
export { extractEmailAddress, extractEmailName } from "@/lib/utils/email-utils";
export { extractDomainFromEmail as extractDomain } from "@/lib/utils/email-utils";

/**
 * Check if an email address is the special agent@inbnd.dev address
 */
export function isAgentEmail(email: string): boolean {
	const cleanEmail = extractEmailAddress(email);
	return cleanEmail.toLowerCase() === "agent@inbnd.dev";
}

/**
 * Check if a user can send from a given email address
 * Returns true if:
 * 1. The email is agent@inbnd.dev (allowed for all users)
 * 2. The user owns the domain (checked separately in the API)
 */
export function canUserSendFromEmail(email: string): {
	isAgentEmail: boolean;
	domain: string;
} {
	const domain = extractDomainFromEmail(email);
	const isAgent = isAgentEmail(email);

	return {
		isAgentEmail: isAgent,
		domain,
	};
}
