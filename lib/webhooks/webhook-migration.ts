/**
 * Webhook to Endpoints Migration System
 *
 * This module handles the automatic migration of legacy webhook configurations to the new endpoints system.
 * It provides functions to check if migration is needed and perform the migration, ensuring users can seamlessly
 * transition from the old webhooks table to the new endpoints table without losing their configurations.
 * The migration runs automatically when users load their endpoints page if they have webhooks but no endpoints.
 */

import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { WebhookConfig } from "@/features/endpoints/types";
import { db } from "@/lib/db";
import type { NewEndpoint, Webhook } from "@/lib/db/schema";
import { emailGroups, endpoints, user, webhooks } from "@/lib/db/schema";
import { generateNewWebhookVerificationToken } from "@/lib/webhooks/verification";

export interface MigrationResult {
	success: boolean;
	migratedCount: number;
	skippedCount: number;
	errors: string[];
}

/**
 * Check if a user has any webhooks that need to be migrated to endpoints
 */
export async function checkWebhookMigrationNeeded(
	userId: string,
): Promise<boolean> {
	try {
		// First check if migration has already been completed
		const userRecord = await db
			.select({ webhooksToEndpointsMigrated: user.webhooksToEndpointsMigrated })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (userRecord[0]?.webhooksToEndpointsMigrated) {
			console.log(`ℹ️ Migration already completed for user: ${userId}`);
			return false; // Migration already done
		}

		// Check if user has any webhooks
		const userWebhooks = await db
			.select({ id: webhooks.id })
			.from(webhooks)
			.where(eq(webhooks.userId, userId))
			.limit(1);

		if (userWebhooks.length === 0) {
			console.log(`ℹ️ No webhooks found for user: ${userId}`);
			return false; // No webhooks to migrate
		}

		console.log(
			`🔍 Migration needed for user: ${userId} - has webhooks but migration flag not set`,
		);
		return true; // Migration is needed
	} catch (error) {
		console.error("Error checking webhook migration status:", error);
		return false;
	}
}

/**
 * Migrate all webhooks for a user to the new endpoints system
 */
export async function migrateUserWebhooksToEndpoints(
	userId: string,
): Promise<MigrationResult> {
	const result: MigrationResult = {
		success: false,
		migratedCount: 0,
		skippedCount: 0,
		errors: [],
	};

	try {
		console.log(`🔄 Starting webhook migration for user: ${userId}`);

		// Get all webhooks for the user
		const userWebhooks = await db
			.select()
			.from(webhooks)
			.where(eq(webhooks.userId, userId));

		if (userWebhooks.length === 0) {
			console.log(`ℹ️ No webhooks found for user: ${userId}`);
			result.success = true;
			return result;
		}

		console.log(
			`📋 Found ${userWebhooks.length} webhooks to migrate for user: ${userId}`,
		);

		// Check which webhooks have already been migrated by looking for existing endpoints with matching names
		const existingEndpoints = await db
			.select()
			.from(endpoints)
			.where(eq(endpoints.userId, userId));

		const existingEndpointNames = new Set(existingEndpoints.map((e) => e.name));

		for (const webhook of userWebhooks) {
			try {
				// Skip if an endpoint with the same name already exists
				if (existingEndpointNames.has(webhook.name)) {
					console.log(
						`⏭️ Skipping webhook "${webhook.name}" - endpoint already exists`,
					);
					result.skippedCount++;
					continue;
				}

				// Build webhook config from existing webhook data
				const webhookConfig: WebhookConfig = {
					url: webhook.url,
					timeout: webhook.timeout || 30,
					retryAttempts: webhook.retryAttempts || 3,
					headers: webhook.headers ? JSON.parse(webhook.headers) : {},
				};

				// Add secret if it exists
				if (webhook.secret) {
					webhookConfig.secret = webhook.secret;
				}

				// Generate verificationToken so it's available via the API immediately
				webhookConfig.verificationToken = generateNewWebhookVerificationToken();

				// Create new endpoint
				const newEndpoint: NewEndpoint = {
					id: nanoid(),
					name: webhook.name,
					type: "webhook",
					config: JSON.stringify(webhookConfig),
					isActive: webhook.isActive ?? true,
					description:
						webhook.description || `Migrated from webhook: ${webhook.name}`,
					userId: userId,
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				const [createdEndpoint] = await db
					.insert(endpoints)
					.values(newEndpoint)
					.returning();

				console.log(
					`✅ Migrated webhook "${webhook.name}" to endpoint "${createdEndpoint.name}"`,
				);
				result.migratedCount++;
			} catch (error) {
				const errorMessage = `Failed to migrate webhook "${webhook.name}": ${error instanceof Error ? error.message : "Unknown error"}`;
				console.error(`❌ ${errorMessage}`);
				result.errors.push(errorMessage);
			}
		}

		result.success = result.errors.length === 0 || result.migratedCount > 0;

		// If migration was successful (either no errors or at least one migration), mark user as migrated
		if (result.success) {
			try {
				await db
					.update(user)
					.set({
						webhooksToEndpointsMigrated: true,
						updatedAt: new Date(),
					})
					.where(eq(user.id, userId));

				console.log(`✅ Marked user ${userId} as migrated`);
			} catch (flagError) {
				console.error(
					`⚠️ Failed to set migration flag for user ${userId}:`,
					flagError,
				);
				// Don't fail the entire migration if flag setting fails
			}
		}

		console.log(`🏁 Migration completed for user ${userId}:`);
		console.log(`   - Migrated: ${result.migratedCount}`);
		console.log(`   - Skipped: ${result.skippedCount}`);
		console.log(`   - Errors: ${result.errors.length}`);

		return result;
	} catch (error) {
		const errorMessage = `Migration failed for user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`;
		console.error(`❌ ${errorMessage}`);
		result.errors.push(errorMessage);
		return result;
	}
}

/**
 * Reset the migration flag for a user (for testing or support purposes)
 */
export async function resetMigrationFlag(
	userId: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		await db
			.update(user)
			.set({
				webhooksToEndpointsMigrated: false,
				updatedAt: new Date(),
			})
			.where(eq(user.id, userId));

		console.log(`✅ Reset migration flag for user: ${userId}`);
		return { success: true };
	} catch (error) {
		console.error(
			`❌ Failed to reset migration flag for user ${userId}:`,
			error,
		);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
