/**
 * Shared email utilities
 *
 * Consolidates common email operations that were duplicated across the codebase:
 * - Email validation
 * - Domain extraction from email addresses
 * - Email address extraction from "Name <email>" format
 * - Name extraction from "Name <email>" format
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate an email address format
 */
export function isValidEmail(email: string): boolean {
	return EMAIL_REGEX.test(email);
}

/**
 * Extract domain from email address, handling "Name <email>" format.
 * Returns lowercase domain, or empty string if no domain found.
 */
export function extractDomainFromEmail(email: string): string {
	// Fast path: check for angle brackets only if present
	const angleMatch = email.indexOf("<");
	const source =
		angleMatch !== -1
			? email.slice(angleMatch + 1, email.indexOf(">", angleMatch))
			: email;
	const atIndex = source.lastIndexOf("@");
	return atIndex !== -1 ? source.slice(atIndex + 1).toLowerCase() : "";
}

/**
 * Extract email address from formatted email (removes name part).
 * Handles "Name <email@domain.com>" and plain "email@domain.com" formats.
 */
export function extractEmailAddress(email: string): string {
	const emailMatch = email.match(/<([^>]+)>/);
	if (emailMatch) {
		return emailMatch[1];
	}
	return email;
}

/**
 * Extract name from formatted email (removes email part).
 * Returns null if no name part found.
 */
export function extractEmailName(email: string): string | null {
	const nameMatch = email.match(/^(.+?)\s*<[^>]+>$/);
	if (nameMatch) {
		return nameMatch[1].trim().replace(/^["']|["']$/g, "");
	}
	return null;
}
