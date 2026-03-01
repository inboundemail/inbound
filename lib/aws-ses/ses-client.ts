/**
 * Shared SES v2 client factory
 *
 * Provides a cached SESv2Client instance so every module that sends email
 * doesn't repeat the credential-loading boilerplate.
 */

import { SESv2Client } from "@aws-sdk/client-sesv2";

const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let cachedClient: SESv2Client | null = null;

/**
 * Returns the shared SESv2Client, or `null` if credentials are missing.
 */
export function getSesClient(): SESv2Client | null {
	if (cachedClient) return cachedClient;

	if (!awsAccessKeyId || !awsSecretAccessKey) {
		return null;
	}

	cachedClient = new SESv2Client({
		region: awsRegion,
		credentials: {
			accessKeyId: awsAccessKeyId,
			secretAccessKey: awsSecretAccessKey,
		},
	});

	return cachedClient;
}

/**
 * Returns the shared SESv2Client, throwing if credentials are missing.
 */
export function requireSesClient(): SESv2Client {
	const client = getSesClient();
	if (!client) {
		throw new Error(
			"AWS SES credentials not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing)",
		);
	}
	return client;
}
