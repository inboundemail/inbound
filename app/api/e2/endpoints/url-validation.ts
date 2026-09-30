import { isIP } from "node:net";
import { isPublicAddress } from "@/lib/security/safe-fetch";

/**
 * Validates a webhook URL when it is saved, so obviously internal destinations
 * get a clear error. Delivery-time protection (DNS results, redirects) lives in
 * safeFetch; this check alone is not sufficient.
 * @throws Error if the URL is invalid or points to a private/internal host
 */
export function validateWebhookUrl(url: string): string {
  const raw = url?.trim() || "";
  if (!raw) throw new Error("Webhook URL is required");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid webhook URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use http or https");
  }

  if (
    process.env.INBOUND_LOCAL_DEV === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return parsed.toString();
  }

  // The URL parser already normalizes numeric forms like http://2130706433/.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLocalName =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localtest.me");
  if (isLocalName || (isIP(host) && !isPublicAddress(host))) {
    throw new Error(
      "Webhook URL must point to a public address, not a private or internal one",
    );
  }

  return parsed.toString();
}

/**
 * Masks sensitive parts of a URL for logging
 * Removes credentials and query parameters
 */
export function maskUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return "[invalid URL]";
  }
}
