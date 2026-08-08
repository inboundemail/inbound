/**
 * AWS SES Tenant Management Library
 *
 * Provides isolated tenant management for multi-tenant SES architecture.
 * Each tenant gets separate reputation tracking and identity management.
 *
 * Key Features:
 * - Create/manage AWS SES tenants
 * - Associate identities with tenants
 * - Reputation policy management
 * - Tenant status tracking
 */

import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import {
	CreateConfigurationSetCommand,
	CreateConfigurationSetEventDestinationCommand,
	CreateTenantCommand,
	CreateTenantResourceAssociationCommand,
	DeleteConfigurationSetCommand,
	DeleteTenantCommand,
	DeleteTenantResourceAssociationCommand,
	EventType,
	GetConfigurationSetCommand,
	GetTenantCommand,
	ListTenantResourcesCommand,
	ListTenantsCommand,
	PutConfigurationSetSendingOptionsCommand,
	SESv2Client,
	UpdateReputationEntityPolicyCommand,
} from "@aws-sdk/client-sesv2";
import {
	CreateTopicCommand,
	SetTopicAttributesCommand,
	SNSClient,
	SubscribeCommand,
} from "@aws-sdk/client-sns";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { sesTenants } from "@/lib/db/schema";

// Webhook URL for receiving SES events
const WEBHOOK_URL =
	process.env.SES_WEBHOOK_URL ||
	"https://inbound.new/api/inbound/health/tenant";
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

// Types
export interface CreateTenantParams {
	userId: string;
	tenantName?: string;
	reputationPolicy?: "standard" | "strict" | "none";
}

export interface CreateTenantResult {
	tenant: {
		id: string;
		userId: string;
		awsTenantId: string;
		tenantName: string;
		configurationSetName: string | null;
		status: string;
		reputationPolicy: string;
	};
	success: boolean;
	error?: string;
}

export interface AssociateIdentityParams {
	tenantId: string;
	identity: string; // Domain or email address
	resourceType: "IDENTITY";
}

type SesTenantRecord = typeof sesTenants.$inferSelect;

// AWS SESv2 Client Setup (required for tenant management)
const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const STRICT_REPUTATION_POLICY_ARN = `arn:aws:ses:${awsRegion}:aws:reputation-policy/strict`;

let sesv2Client: SESv2Client | null = null;
let snsClient: SNSClient | null = null;
let cloudWatchClient: CloudWatchClient | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
	const awsCredentials = {
		accessKeyId: awsAccessKeyId,
		secretAccessKey: awsSecretAccessKey,
	};

	sesv2Client = new SESv2Client({
		region: awsRegion,
		credentials: awsCredentials,
	});

	snsClient = new SNSClient({
		region: awsRegion,
		credentials: awsCredentials,
	});

	cloudWatchClient = new CloudWatchClient({
		region: awsRegion,
		credentials: awsCredentials,
	});
}

/**
 * SES Tenant Manager Class
 * Handles all tenant operations with AWS SESv2 and local database
 */
export class SESTenantManager {
	private sesv2Client: SESv2Client;
	private snsClient: SNSClient | null;
	private cloudWatchClient: CloudWatchClient | null;

	constructor(client?: SESv2Client) {
		if (!client && !sesv2Client) {
			throw new Error(
				"AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.",
			);
		}
		this.sesv2Client = client || sesv2Client!;
		this.snsClient = snsClient;
		this.cloudWatchClient = cloudWatchClient;
	}

	/**
	 * Setup SNS topics for a tenant's configuration set
	 * This enables real-time notifications for bounces/complaints
	 *
	 * NOTE: CloudWatch alarms have been removed to reduce costs (~$165/month savings).
	 * Rate monitoring is now handled by the webhook at /api/inbound/health/tenant
	 * which processes SNS events and calculates rates in the application layer.
	 */
	async setupTenantMonitoring(
		configSetName: string,
		options?: { skipSns?: boolean; skipAlarms?: boolean },
	): Promise<{
		success: boolean;
		snsTopicArn?: string;
		alertTopicArn?: string;
		error?: string;
	}> {
		if (!this.snsClient || !this.cloudWatchClient) {
			console.warn(
				"⚠️ SNS/CloudWatch clients not configured, skipping monitoring setup",
			);
			return { success: false, error: "SNS/CloudWatch clients not configured" };
		}

		if (!AWS_ACCOUNT_ID) {
			console.warn("⚠️ AWS_ACCOUNT_ID not set, skipping monitoring setup");
			return {
				success: false,
				error: "AWS_ACCOUNT_ID environment variable not set",
			};
		}

		const region = awsRegion;
		let eventsTopicArn: string | undefined;
		let alertsTopicArn: string | undefined;

		try {
			// Step 1: Create SNS topic for SES events (bounces, complaints, etc.)
			if (!options?.skipSns) {
				console.log(`📢 Creating SNS topics for: ${configSetName}`);

				// Events topic
				const eventsTopicName = `ses-${configSetName}-events`;
				const createEventsTopicCommand = new CreateTopicCommand({
					Name: eventsTopicName,
					Tags: [
						{ Key: "ConfigurationSet", Value: configSetName },
						{ Key: "Purpose", Value: "SES event notifications" },
						{ Key: "CreatedBy", Value: "inbound-tenant-manager" },
					],
				});

				const eventsTopicResult = await this.snsClient.send(
					createEventsTopicCommand,
				);
				eventsTopicArn = eventsTopicResult.TopicArn;
				console.log(`✅ Events topic created: ${eventsTopicArn}`);

				// Alerts topic (for CloudWatch alarms)
				const alertsTopicName = `ses-${configSetName}-alerts`;
				const createAlertsTopicCommand = new CreateTopicCommand({
					Name: alertsTopicName,
					Tags: [
						{ Key: "ConfigurationSet", Value: configSetName },
						{ Key: "Purpose", Value: "SES reputation alerts" },
						{ Key: "CreatedBy", Value: "inbound-tenant-manager" },
					],
				});

				const alertsTopicResult = await this.snsClient.send(
					createAlertsTopicCommand,
				);
				alertsTopicArn = alertsTopicResult.TopicArn;
				console.log(`✅ Alerts topic created: ${alertsTopicArn}`);

				// Subscribe webhook to both topics
				if (WEBHOOK_URL) {
					console.log(`🔗 Subscribing webhook to SNS topics: ${WEBHOOK_URL}`);

					// Subscribe to events topic
					const subscribeEventsCommand = new SubscribeCommand({
						TopicArn: eventsTopicArn,
						Protocol: "https",
						Endpoint: WEBHOOK_URL,
					});
					await this.snsClient.send(subscribeEventsCommand);
					console.log(`✅ Webhook subscribed to events topic`);

					// Subscribe to alerts topic
					const subscribeAlertsCommand = new SubscribeCommand({
						TopicArn: alertsTopicArn,
						Protocol: "https",
						Endpoint: WEBHOOK_URL,
					});
					await this.snsClient.send(subscribeAlertsCommand);
					console.log(`✅ Webhook subscribed to alerts topic`);
				}

				// Add SES → SNS event destination for bounces/complaints
				console.log(`📧 Creating SES → SNS event destination`);
				try {
					const snsEventDestinationCommand =
						new CreateConfigurationSetEventDestinationCommand({
							ConfigurationSetName: configSetName,
							EventDestinationName: `${configSetName}-sns-events`,
							EventDestination: {
								Enabled: true,
								MatchingEventTypes: [
									EventType.BOUNCE,
									EventType.COMPLAINT,
									EventType.DELIVERY,
									EventType.SEND,
									EventType.REJECT,
								],
								SnsDestination: {
									TopicArn: eventsTopicArn,
								},
							},
						});
					await this.sesv2Client.send(snsEventDestinationCommand);
					console.log(`✅ SES → SNS event destination created`);
				} catch (snsDestError: any) {
					if (
						snsDestError?.name === "AlreadyExistsException" ||
						snsDestError?.message?.includes("already exists")
					) {
						console.log(`📋 SES → SNS event destination already exists`);
					} else {
						console.warn(
							`⚠️ Failed to create SES → SNS event destination:`,
							snsDestError,
						);
					}
				}
			}

			// NOTE: CloudWatch alarms have been removed to reduce costs (~$165/month)
			// Rate monitoring is now handled by the webhook at /api/inbound/health/tenant
			// which processes SNS events and calculates rates using the emailDeliveryEvents table.
			// See: app/api/inbound/health/tenant/route.ts

			console.log(`✅ Tenant monitoring setup complete for: ${configSetName}`);
			return {
				success: true,
				snsTopicArn: eventsTopicArn,
				alertTopicArn: alertsTopicArn,
			};
		} catch (error) {
			console.error(
				`❌ Failed to setup tenant monitoring for ${configSetName}:`,
				error,
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private buildTenantArn(tenantName: string, awsTenantId: string): string {
		if (!AWS_ACCOUNT_ID) {
			throw new Error("AWS_ACCOUNT_ID environment variable is not set");
		}

		return `arn:aws:ses:${awsRegion}:${AWS_ACCOUNT_ID}:tenant/${tenantName}/${awsTenantId}`;
	}

	private async applyStrictReputationPolicy(
		tenantName: string,
		awsTenantId: string,
	): Promise<{ success: boolean; error?: string }> {
		try {
			const tenantArn = this.buildTenantArn(tenantName, awsTenantId);
			const command = new UpdateReputationEntityPolicyCommand({
				ReputationEntityType: "RESOURCE",
				ReputationEntityReference: tenantArn,
				ReputationEntityPolicy: STRICT_REPUTATION_POLICY_ARN,
			});

			await this.sesv2Client.send(command);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown error applying strict reputation policy",
			};
		}
	}

	private async ensureStrictPolicyForTenantRecord(
		tenant: SesTenantRecord,
	): Promise<{ tenant: SesTenantRecord; success: boolean; error?: string }> {
		const policyResult = await this.applyStrictReputationPolicy(
			tenant.tenantName,
			tenant.awsTenantId,
		);

		if (!policyResult.success) {
			return {
				tenant,
				success: false,
				error: policyResult.error,
			};
		}

		if (tenant.reputationPolicy === "strict") {
			return {
				tenant,
				success: true,
			};
		}

		const [updatedTenant] = await db
			.update(sesTenants)
			.set({
				reputationPolicy: "strict",
				updatedAt: new Date(),
			})
			.where(eq(sesTenants.id, tenant.id))
			.returning();

		return {
			tenant: updatedTenant || { ...tenant, reputationPolicy: "strict" },
			success: true,
		};
	}

	/**
	 * Create a new tenant for a user
	 * This creates the AWS SES tenant, configuration set, associates them, and creates the local database record
	 */
	async createTenant({
		userId,
		tenantName,
		reputationPolicy = "strict",
	}: CreateTenantParams): Promise<CreateTenantResult> {
		try {
			console.log(`🏢 Creating SES tenant for user: ${userId}`);
			const enforcedReputationPolicy: "strict" = "strict";

			if (reputationPolicy && reputationPolicy !== "strict") {
				console.warn(
					`⚠️ Requested reputation policy "${reputationPolicy}" ignored; enforcing "strict"`,
				);
			}

			// Check if user already has a tenant
			const existingTenant = await db
				.select()
				.from(sesTenants)
				.where(eq(sesTenants.userId, userId))
				.limit(1);

			if (existingTenant.length > 0) {
				const strictPolicyResult = await this.ensureStrictPolicyForTenantRecord(
					existingTenant[0],
				);

				if (!strictPolicyResult.success) {
					return {
						tenant: existingTenant[0],
						success: false,
						error: `Tenant exists but strict reputation policy could not be enforced: ${strictPolicyResult.error || "Unknown error"}`,
					};
				}

				return {
					tenant: strictPolicyResult.tenant,
					success: true,
				};
			}

			// Generate tenant name if not provided
			const finalTenantName = tenantName || `user-${userId}`;
			// Configuration set name based on tenant name
			const configSetName = `tenant-${finalTenantName}`;

			// Create AWS SES tenant
			const createCommand = new CreateTenantCommand({
				TenantName: finalTenantName,
				Tags: [
					{ Key: "UserId", Value: userId },
					{ Key: "Environment", Value: process.env.NODE_ENV || "development" },
					{ Key: "CreatedBy", Value: "inbound-tenant-manager" },
				],
			});

			console.log(`📡 Creating AWS SES tenant: ${finalTenantName}`);
			let awsTenantId: string;

			try {
				const awsResponse = await this.sesv2Client.send(createCommand);
				awsTenantId = awsResponse.TenantId || "";

				if (!awsTenantId) {
					throw new Error(
						"Failed to create AWS SES tenant - no tenant ID returned",
					);
				}
				console.log(`✅ AWS SES tenant created with ID: ${awsTenantId}`);
			} catch (error: any) {
				// Handle case where tenant already exists in AWS
				if (
					error?.name === "AlreadyExistsException" ||
					error?.message?.includes("already exists")
				) {
					console.log(
						`📋 Tenant already exists in AWS, getting existing tenant details...`,
					);

					// Get existing tenant details
					const getTenantCommand = new GetTenantCommand({
						TenantName: finalTenantName,
					});

					try {
						const existingTenantResponse =
							await this.sesv2Client.send(getTenantCommand);
						awsTenantId = existingTenantResponse.Tenant?.TenantId || "";
						console.log(`✅ Using existing AWS tenant: ${awsTenantId}`);
					} catch (getError) {
						throw new Error(
							`Tenant exists but could not retrieve details: ${getError instanceof Error ? getError.message : "Unknown error"}`,
						);
					}
				} else {
					throw error; // Re-throw if not an "already exists" error
				}
			}

			console.log(
				`🛡️ Enforcing strict reputation policy for: ${finalTenantName}`,
			);
			const strictPolicyResult = await this.applyStrictReputationPolicy(
				finalTenantName,
				awsTenantId,
			);

			if (!strictPolicyResult.success) {
				throw new Error(
					`Failed to enforce strict reputation policy for tenant ${finalTenantName}: ${strictPolicyResult.error || "Unknown error"}`,
				);
			}
			console.log(
				`✅ Strict reputation policy applied to tenant: ${finalTenantName}`,
			);

			// Step 2: Create Configuration Set for this tenant
			console.log(`📋 Creating configuration set: ${configSetName}`);
			let configSetCreated = false;

			try {
				const createConfigSetCommand = new CreateConfigurationSetCommand({
					ConfigurationSetName: configSetName,
					Tags: [
						{ Key: "UserId", Value: userId },
						{ Key: "TenantId", Value: awsTenantId },
						{ Key: "TenantName", Value: finalTenantName },
						{
							Key: "Environment",
							Value: process.env.NODE_ENV || "development",
						},
						{ Key: "CreatedBy", Value: "inbound-tenant-manager" },
					],
					// Enable reputation metrics tracking
					ReputationOptions: {
						ReputationMetricsEnabled: true,
					},
					// Enable sending
					SendingOptions: {
						SendingEnabled: true,
					},
				});

				await this.sesv2Client.send(createConfigSetCommand);
				configSetCreated = true;
				console.log(`✅ Configuration set created: ${configSetName}`);
			} catch (configError: any) {
				// Handle case where config set already exists
				if (
					configError?.name === "AlreadyExistsException" ||
					configError?.message?.includes("already exists")
				) {
					console.log(`📋 Configuration set already exists: ${configSetName}`);
					configSetCreated = true;
				} else {
					console.error(
						`⚠️ Failed to create configuration set, continuing without it:`,
						configError,
					);
					// Don't fail tenant creation if config set fails - we can backfill later
				}
			}

			// Step 3: Add CloudWatch Event Destination for metrics tracking
			if (configSetCreated) {
				console.log(
					`📊 Adding CloudWatch event destination to configuration set: ${configSetName}`,
				);
				try {
					const eventDestinationCommand =
						new CreateConfigurationSetEventDestinationCommand({
							ConfigurationSetName: configSetName,
							EventDestinationName: `${configSetName}-cloudwatch`,
							EventDestination: {
								Enabled: true,
								// Track all event types for comprehensive metrics
								MatchingEventTypes: [
									EventType.SEND,
									EventType.DELIVERY,
									EventType.BOUNCE,
									EventType.COMPLAINT,
									EventType.REJECT,
									EventType.RENDERING_FAILURE,
								],
								CloudWatchDestination: {
									DimensionConfigurations: [
										{
											DimensionName: "TenantId",
											DimensionValueSource: "MESSAGE_TAG",
											DefaultDimensionValue: awsTenantId,
										},
										{
											DimensionName: "ConfigurationSet",
											DimensionValueSource: "MESSAGE_TAG",
											DefaultDimensionValue: configSetName,
										},
									],
								},
							},
						});

					await this.sesv2Client.send(eventDestinationCommand);
					console.log(
						`✅ CloudWatch event destination added to configuration set`,
					);
				} catch (eventDestError: any) {
					if (
						eventDestError?.name === "AlreadyExistsException" ||
						eventDestError?.message?.includes("already exists")
					) {
						console.log(
							`📋 CloudWatch event destination already exists for: ${configSetName}`,
						);
					} else {
						console.warn(
							`⚠️ Failed to add CloudWatch event destination:`,
							eventDestError,
						);
						// Continue - the configuration set will still work, just without CloudWatch metrics
					}
				}
			}

			// Step 4: Associate Configuration Set with Tenant
			if (configSetCreated) {
				console.log(
					`🔗 Associating configuration set ${configSetName} with tenant ${finalTenantName}`,
				);
				try {
					const associateConfigSetCommand =
						new CreateTenantResourceAssociationCommand({
							TenantName: finalTenantName,
							ResourceArn: `arn:aws:ses:${process.env.AWS_REGION || "us-east-2"}:${process.env.AWS_ACCOUNT_ID}:configuration-set/${configSetName}`,
						});

					await this.sesv2Client.send(associateConfigSetCommand);
					console.log(`✅ Configuration set associated with tenant`);
				} catch (assocError: any) {
					if (
						assocError?.name === "AlreadyExistsException" ||
						assocError?.message?.includes("already exists")
					) {
						console.log(`📋 Configuration set already associated with tenant`);
					} else {
						console.error(
							`⚠️ Failed to associate configuration set with tenant:`,
							assocError,
						);
						// Don't fail tenant creation if association fails
					}
				}
			}

			// Store in local database
			const tenantId = `tenant_${nanoid()}`;
			const [newTenant] = await db
				.insert(sesTenants)
				.values({
					id: tenantId,
					userId,
					awsTenantId,
					tenantName: finalTenantName,
					configurationSetName: configSetCreated ? configSetName : null,
					status: "active",
					reputationPolicy: enforcedReputationPolicy,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.returning();

			console.log(
				`✅ SES tenant created successfully: ${tenantId} -> ${awsTenantId} (config set: ${configSetCreated ? configSetName : "none"})`,
			);

			// Step 5: Setup SNS topics and CloudWatch alarms for monitoring
			if (configSetCreated) {
				console.log(`📊 Setting up monitoring for tenant: ${configSetName}`);
				const monitoringResult =
					await this.setupTenantMonitoring(configSetName);
				if (!monitoringResult.success) {
					console.warn(
						`⚠️ Monitoring setup incomplete for ${configSetName}: ${monitoringResult.error}`,
					);
					// Don't fail tenant creation if monitoring setup fails - it can be backfilled later
				}
			}

			return {
				tenant: newTenant,
				success: true,
			};
		} catch (error) {
			console.error("❌ Failed to create SES tenant:", error);
			return {
				tenant: null as any,
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown error creating tenant",
			};
		}
	}

	/**
	 * Create and associate a configuration set for an existing tenant
	 * Used for backfilling tenants that were created before config set support
	 */
	async createConfigurationSetForTenant(
		tenantId: string,
	): Promise<{ success: boolean; configSetName?: string; error?: string }> {
		try {
			// Get tenant info from database
			const tenant = await db
				.select()
				.from(sesTenants)
				.where(eq(sesTenants.id, tenantId))
				.limit(1);

			if (tenant.length === 0) {
				return { success: false, error: `Tenant not found: ${tenantId}` };
			}

			const tenantRecord = tenant[0];

			// Check if tenant already has a configuration set
			if (tenantRecord.configurationSetName) {
				console.log(
					`📋 Tenant ${tenantId} already has configuration set: ${tenantRecord.configurationSetName}`,
				);
				return {
					success: true,
					configSetName: tenantRecord.configurationSetName,
				};
			}

			const configSetName = `tenant-${tenantRecord.tenantName}`;

			console.log(
				`📋 Creating configuration set for existing tenant: ${configSetName}`,
			);

			// Create Configuration Set
			try {
				const createConfigSetCommand = new CreateConfigurationSetCommand({
					ConfigurationSetName: configSetName,
					Tags: [
						{ Key: "UserId", Value: tenantRecord.userId },
						{ Key: "TenantId", Value: tenantRecord.awsTenantId },
						{ Key: "TenantName", Value: tenantRecord.tenantName },
						{
							Key: "Environment",
							Value: process.env.NODE_ENV || "development",
						},
						{ Key: "CreatedBy", Value: "inbound-tenant-backfill" },
					],
					ReputationOptions: {
						ReputationMetricsEnabled: true,
					},
					SendingOptions: {
						SendingEnabled: true,
					},
				});

				await this.sesv2Client.send(createConfigSetCommand);
				console.log(`✅ Configuration set created: ${configSetName}`);
			} catch (configError: any) {
				if (
					configError?.name === "AlreadyExistsException" ||
					configError?.message?.includes("already exists")
				) {
					console.log(`📋 Configuration set already exists: ${configSetName}`);
				} else {
					throw configError;
				}
			}

			// Add CloudWatch Event Destination for metrics tracking
			console.log(
				`📊 Adding CloudWatch event destination to configuration set: ${configSetName}`,
			);
			try {
				const eventDestinationCommand =
					new CreateConfigurationSetEventDestinationCommand({
						ConfigurationSetName: configSetName,
						EventDestinationName: `${configSetName}-cloudwatch`,
						EventDestination: {
							Enabled: true,
							MatchingEventTypes: [
								EventType.SEND,
								EventType.DELIVERY,
								EventType.BOUNCE,
								EventType.COMPLAINT,
								EventType.REJECT,
								EventType.RENDERING_FAILURE,
							],
							CloudWatchDestination: {
								DimensionConfigurations: [
									{
										DimensionName: "TenantId",
										DimensionValueSource: "MESSAGE_TAG",
										DefaultDimensionValue: tenantRecord.awsTenantId,
									},
									{
										DimensionName: "ConfigurationSet",
										DimensionValueSource: "MESSAGE_TAG",
										DefaultDimensionValue: configSetName,
									},
								],
							},
						},
					});

				await this.sesv2Client.send(eventDestinationCommand);
				console.log(
					`✅ CloudWatch event destination added to configuration set`,
				);
			} catch (eventDestError: any) {
				if (
					eventDestError?.name === "AlreadyExistsException" ||
					eventDestError?.message?.includes("already exists")
				) {
					console.log(
						`📋 CloudWatch event destination already exists for: ${configSetName}`,
					);
				} else {
					console.warn(
						`⚠️ Failed to add CloudWatch event destination:`,
						eventDestError,
					);
					// Continue - the configuration set will still work
				}
			}

			// Associate Configuration Set with Tenant
			console.log(
				`🔗 Associating configuration set ${configSetName} with tenant ${tenantRecord.tenantName}`,
			);
			try {
				const associateConfigSetCommand =
					new CreateTenantResourceAssociationCommand({
						TenantName: tenantRecord.tenantName,
						ResourceArn: `arn:aws:ses:${process.env.AWS_REGION || "us-east-2"}:${process.env.AWS_ACCOUNT_ID}:configuration-set/${configSetName}`,
					});

				await this.sesv2Client.send(associateConfigSetCommand);
				console.log(`✅ Configuration set associated with tenant`);
			} catch (assocError: any) {
				if (
					assocError?.name === "AlreadyExistsException" ||
					assocError?.message?.includes("already exists")
				) {
					console.log(`📋 Configuration set already associated with tenant`);
				} else {
					throw assocError;
				}
			}

			// Update database record
			await db
				.update(sesTenants)
				.set({
					configurationSetName: configSetName,
					updatedAt: new Date(),
				})
				.where(eq(sesTenants.id, tenantId));

			console.log(`✅ Database updated with configuration set name`);

			return { success: true, configSetName };
		} catch (error) {
			console.error(
				`❌ Failed to create configuration set for tenant ${tenantId}:`,
				error,
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Get or create tenant for a user
	 * This ensures every user has a tenant before creating identities
	 */
	async getOrCreateUserTenant(userId: string): Promise<CreateTenantResult> {
		try {
			// First try to get existing tenant
			const existingTenant = await db
				.select()
				.from(sesTenants)
				.where(eq(sesTenants.userId, userId))
				.limit(1);

			if (existingTenant.length > 0) {
				const strictPolicyResult = await this.ensureStrictPolicyForTenantRecord(
					existingTenant[0],
				);

				if (!strictPolicyResult.success) {
					return {
						tenant: existingTenant[0],
						success: false,
						error: `Failed to enforce strict reputation policy for existing tenant: ${strictPolicyResult.error || "Unknown error"}`,
					};
				}

				console.log(
					`📋 Found existing tenant for user ${userId}: ${strictPolicyResult.tenant.id}`,
				);
				return {
					tenant: strictPolicyResult.tenant,
					success: true,
				};
			}

			// Create new tenant if none exists
			console.log(`🆕 Creating new tenant for user: ${userId}`);
			return await this.createTenant({ userId });
		} catch (error) {
			console.error("❌ Failed to get or create tenant:", error);
			return {
				tenant: null as any,
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Associate an identity (domain/email) with a tenant
	 * This is called when creating new domains or email addresses
	 */
	async associateIdentityWithTenant({
		tenantId,
		identity,
		resourceType,
	}: AssociateIdentityParams): Promise<{ success: boolean; error?: string }> {
		try {
			// Get tenant info from database
			const tenant = await db
				.select()
				.from(sesTenants)
				.where(eq(sesTenants.id, tenantId))
				.limit(1);

			if (tenant.length === 0) {
				throw new Error(`Tenant not found: ${tenantId}`);
			}

			const awsTenantId = tenant[0].awsTenantId;

			console.log(
				`🔗 Associating identity ${identity} with tenant ${awsTenantId} (${awsTenantId})`,
			);

			// Associate identity with AWS SES tenant (use tenantName, not awsTenantId)
			const tenantName = tenant[0].tenantName; // Use the human-readable tenant name
			const associateCommand = new CreateTenantResourceAssociationCommand({
				TenantName: tenantName, // AWS requires the TenantName (human-readable), not TenantId
				ResourceArn: `arn:aws:ses:${process.env.AWS_REGION || "us-east-2"}:${process.env.AWS_ACCOUNT_ID}:identity/${identity}`, // Full ARN required
			});

			await this.sesv2Client.send(associateCommand);

			console.log(
				`✅ Identity ${identity} successfully associated with tenant ${tenantName}`,
			);

			return { success: true };
		} catch (error) {
			console.error(
				`❌ Failed to associate identity ${identity} with tenant ${tenantId}:`,
				error,
			);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown error associating identity",
			};
		}
	}

	/**
	 * Get tenant information including AWS status
	 */
	async getTenant(tenantId: string): Promise<{
		tenant: any;
		awsTenant?: any;
		success: boolean;
		error?: string;
	}> {
		try {
			// Get local tenant record
			const localTenant = await db
				.select()
				.from(sesTenants)
				.where(eq(sesTenants.id, tenantId))
				.limit(1);

			if (localTenant.length === 0) {
				return {
					tenant: null,
					success: false,
					error: "Tenant not found",
				};
			}

			// Get AWS tenant details (use tenantName, not awsTenantId)
			const getTenantCommand = new GetTenantCommand({
				TenantName: localTenant[0].tenantName, // AWS requires the TenantName (human-readable), not TenantId
			});

			const awsTenant = await this.sesv2Client.send(getTenantCommand);

			return {
				tenant: localTenant[0],
				awsTenant,
				success: true,
			};
		} catch (error) {
			console.error(`❌ Failed to get tenant ${tenantId}:`, error);
			return {
				tenant: null,
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown error getting tenant",
			};
		}
	}

	/**
	 * List all tenant resources (identities associated with tenant)
	 */
	async listTenantResources(
		tenantId: string,
	): Promise<{ resources: any[]; success: boolean; error?: string }> {
		try {
			const tenant = await db
				.select()
				.from(sesTenants)
				.where(eq(sesTenants.id, tenantId))
				.limit(1);

			if (tenant.length === 0) {
				return {
					resources: [],
					success: false,
					error: "Tenant not found",
				};
			}

			const listResourcesCommand = new ListTenantResourcesCommand({
				TenantName: tenant[0].tenantName, // AWS requires the TenantName (human-readable), not TenantId
			});

			const result = await this.sesv2Client.send(listResourcesCommand);

			// Note: Property structure needs verification - temporarily return empty for MVP
			console.log("📋 Tenant resources response:", result);
			return {
				resources: [], // TODO: Fix property name when AWS SDK types are clarified
				success: true,
			};
		} catch (error) {
			console.error(
				`❌ Failed to list tenant resources for ${tenantId}:`,
				error,
			);
			return {
				resources: [],
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown error listing resources",
			};
		}
	}
}

// Export default instance
export const sesTenantManager = sesv2Client
	? new SESTenantManager(sesv2Client)
	: null;

// Utility functions
export async function getUserTenant(
	userId: string,
): Promise<CreateTenantResult> {
	if (!sesTenantManager) {
		return {
			tenant: null as any,
			success: false,
			error: "AWS SES not configured for tenant management",
		};
	}
	return sesTenantManager.getOrCreateUserTenant(userId);
}

export async function associateIdentityWithUserTenant(
	userId: string,
	identity: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!sesTenantManager) {
			return {
				success: false,
				error: "AWS SES not configured for tenant management",
			};
		}

		// Get user's tenant
		const tenantResult = await getUserTenant(userId);
		if (!tenantResult.success) {
			return {
				success: false,
				error: `Failed to get user tenant: ${tenantResult.error}`,
			};
		}

		// Associate identity with tenant
		return sesTenantManager.associateIdentityWithTenant({
			tenantId: tenantResult.tenant.id,
			identity,
			resourceType: "IDENTITY",
		});
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

function buildIdentityArn(identity: string): string {
	if (!AWS_ACCOUNT_ID) {
		throw new Error("AWS_ACCOUNT_ID environment variable is not set");
	}

	return `arn:aws:ses:${awsRegion}:${AWS_ACCOUNT_ID}:identity/${identity}`;
}

export async function unlinkIdentityFromTenant(
	tenantName: string,
	identity: string,
): Promise<{ success: boolean; alreadyUnlinked?: boolean; error?: string }> {
	if (!sesv2Client) {
		return { success: false, error: "AWS SES not configured" };
	}

	try {
		const command = new DeleteTenantResourceAssociationCommand({
			TenantName: tenantName,
			ResourceArn: buildIdentityArn(identity),
		});

		await sesv2Client.send(command);
		return { success: true };
	} catch (error) {
		if (error instanceof Error) {
			const notFoundError =
				error.name.includes("NotFound") ||
				error.message.toLowerCase().includes("not found");

			if (notFoundError) {
				return { success: true, alreadyUnlinked: true };
			}

			return { success: false, error: error.message };
		}

		return { success: false, error: "Unknown error unlinking identity" };
	}
}

/**
 * Pause sending for a tenant's configuration set
 * Used when critical reputation thresholds are breached
 *
 * @param configurationSetName - The configuration set name to pause
 * @param reason - Reason for pausing (logged and stored)
 * @returns Success status and any error message
 */
export async function pauseTenantSending(
	configurationSetName: string,
	reason: string,
): Promise<{ success: boolean; error?: string }> {
	return disableTenantSending(configurationSetName, reason, "paused");
}

export async function suspendTenantSending(
	configurationSetName: string,
	reason: string,
): Promise<{ success: boolean; error?: string }> {
	return disableTenantSending(configurationSetName, reason, "suspended");
}

async function disableTenantSending(
	configurationSetName: string,
	reason: string,
	tenantStatus: "paused" | "suspended",
): Promise<{ success: boolean; error?: string }> {
	if (!sesv2Client) {
		console.error("❌ disableTenantSending - AWS SES not configured");
		return { success: false, error: "AWS SES not configured" };
	}

	try {
		console.log(
			`🛑 disableTenantSending - Disabling sending for: ${configurationSetName}`,
		);
		console.log(`   Reason: ${reason}`);

		// Disable sending for this configuration set
		const command = new PutConfigurationSetSendingOptionsCommand({
			ConfigurationSetName: configurationSetName,
			SendingEnabled: false,
		});

		await sesv2Client.send(command);

		// Update database to reflect paused status
		const [tenant] = await db
			.select()
			.from(sesTenants)
			.where(eq(sesTenants.configurationSetName, configurationSetName))
			.limit(1);

		if (tenant) {
			await db
				.update(sesTenants)
				.set({
					status: tenantStatus,
					updatedAt: new Date(),
				})
				.where(eq(sesTenants.id, tenant.id));

			console.log(
				`✅ disableTenantSending - Tenant status updated to '${tenantStatus}' in database`,
			);
		}

		console.log(
			`✅ disableTenantSending - Sending disabled for: ${configurationSetName}`,
		);
		return { success: true };
	} catch (error) {
		console.error(
			`❌ disableTenantSending - Failed to disable sending:`,
			error,
		);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Resume sending for a tenant's configuration set
 * Used to re-enable sending after issues are resolved
 *
 * @param configurationSetName - The configuration set name to resume
 * @returns Success status and any error message
 */
export async function resumeTenantSending(
	configurationSetName: string,
): Promise<{ success: boolean; error?: string }> {
	if (!sesv2Client) {
		console.error("❌ resumeTenantSending - AWS SES not configured");
		return { success: false, error: "AWS SES not configured" };
	}

	try {
		console.log(
			`▶️ resumeTenantSending - Resuming sending for: ${configurationSetName}`,
		);

		// Enable sending for this configuration set
		const command = new PutConfigurationSetSendingOptionsCommand({
			ConfigurationSetName: configurationSetName,
			SendingEnabled: true,
		});

		await sesv2Client.send(command);

		// Update database to reflect active status
		const [tenant] = await db
			.select()
			.from(sesTenants)
			.where(eq(sesTenants.configurationSetName, configurationSetName))
			.limit(1);

		if (tenant) {
			await db
				.update(sesTenants)
				.set({
					status: "active",
					updatedAt: new Date(),
				})
				.where(eq(sesTenants.id, tenant.id));

			console.log(
				`✅ resumeTenantSending - Tenant status updated to 'active' in database`,
			);
		}

		console.log(
			`✅ resumeTenantSending - Sending enabled for: ${configurationSetName}`,
		);
		return { success: true };
	} catch (error) {
		console.error(`❌ resumeTenantSending - Failed to resume sending:`, error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
