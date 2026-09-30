/**
 * Shared endpoint configuration validation utilities
 * Consolidates validation logic from v2 endpoint routes
 */

import { validateWebhookUrl } from "./url-validation";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates endpoint configuration based on type
 * @param type - The endpoint type: 'webhook', 'email', or 'email_group'
 * @param config - The configuration object to validate
 * @returns ValidationResult with valid flag and optional error message
 */
export function validateEndpointConfig(
  type: string,
  config: any
): ValidationResult {
  try {
    switch (type) {
      case "webhook":
        return validateWebhookConfig(config);

      case "email":
        return validateEmailConfig(config);

      case "email_group":
        return validateEmailGroupConfig(config);

      default:
        return { valid: false, error: "Unknown endpoint type" };
    }
  } catch (error) {
    console.error("💥 Error during config validation:", error);
    return { valid: false, error: "Configuration validation failed" };
  }
}

/**
 * Validates webhook endpoint configuration
 */
function validateWebhookConfig(config: any): ValidationResult {
  if (!config.url) {
    return { valid: false, error: "Webhook URL is required" };
  }

  if (typeof config.url !== "string") {
    return { valid: false, error: "Webhook URL must be a string" };
  }

  try {
    validateWebhookUrl(config.url);
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }

  if (
    config.timeout &&
    (typeof config.timeout !== "number" ||
      config.timeout < 1 ||
      config.timeout > 300)
  ) {
    return {
      valid: false,
      error: "Timeout must be a number between 1 and 300 seconds",
    };
  }

  if (
    config.retryAttempts &&
    (typeof config.retryAttempts !== "number" ||
      config.retryAttempts < 0 ||
      config.retryAttempts > 10)
  ) {
    return {
      valid: false,
      error: "Retry attempts must be a number between 0 and 10",
    };
  }

  return { valid: true };
}

/**
 * Validates email forwarding endpoint configuration
 */
function validateEmailConfig(config: any): ValidationResult {
  if (!config.forwardTo) {
    return { valid: false, error: "Forward-to email address is required" };
  }

  if (typeof config.forwardTo !== "string") {
    return { valid: false, error: "Forward-to email must be a string" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(config.forwardTo)) {
    return { valid: false, error: "Invalid forward-to email address format" };
  }

  return { valid: true };
}

/**
 * Validates email group endpoint configuration
 */
function validateEmailGroupConfig(config: any): ValidationResult {
  if (!config.emails || !Array.isArray(config.emails)) {
    return { valid: false, error: "Email group must have an emails array" };
  }

  if (config.emails.length === 0) {
    return {
      valid: false,
      error: "Email group must have at least one email address",
    };
  }

  if (config.emails.length > 50) {
    return {
      valid: false,
      error: "Email group cannot have more than 50 email addresses",
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of config.emails) {
    if (typeof email !== "string" || !emailRegex.test(email)) {
      return {
        valid: false,
        error: `Invalid email address in group: ${email}`,
      };
    }
  }

  const uniqueEmails = new Set(config.emails);
  if (uniqueEmails.size !== config.emails.length) {
    return {
      valid: false,
      error: "Email group contains duplicate email addresses",
    };
  }

  return { valid: true };
}
