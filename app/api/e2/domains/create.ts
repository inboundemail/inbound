import { Autumn as autumn } from "autumn-js";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { AWSSESReceiptRuleManager } from "@/lib/aws-ses/aws-ses-rules";
import { BatchRuleManager } from "@/lib/aws-ses/batch-rule-manager";
import { db } from "@/lib/db";
import {
	createDomainVerification,
	getVerifiedParentDomain,
} from "@/lib/db/domains";
import {
	blockedSignupDomains,
	domainDnsRecords,
	emailDomains,
} from "@/lib/db/schema";
import { checkDomainCanReceiveEmails } from "@/lib/domains-and-dns/dns";
import { isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import { initiateDomainVerification } from "@/lib/domains-and-dns/domain-verification";
import { validateAndRateLimit } from "../lib/auth";

// AWS Region for MX record
const awsRegion = process.env.AWS_REGION || "us-east-2";
const lambdaFunctionName =
	process.env.LAMBDA_FUNCTION_NAME || "email-processor";
const s3BucketName = process.env.S3_BUCKET_NAME;
const awsAccountId = process.env.AWS_ACCOUNT_ID;

// Request/Response Types (OpenAPI-compatible)
const CreateDomainBody = t.Object({
	domain: t.String({ minLength: 1, maxLength: 253 }),
});

const DnsRecordSchema = t.Object({
	type: t.String(),
	name: t.String(),
	value: t.String(),
	description: t.Optional(t.String()),
	isRequired: t.Boolean(),
});

const DnsConflictSchema = t.Object({
	hasConflict: t.Boolean(),
	conflictType: t.Optional(
		t.Union([t.Literal("mx"), t.Literal("cname"), t.Literal("both")]),
	),
	message: t.String(),
	existingRecords: t.Optional(
		t.Array(
			t.Object({
				type: t.String(),
				value: t.String(),
			}),
		),
	),
});

const CreateDomainResponse = t.Object({
	id: t.String(),
	domain: t.String(),
	status: t.Union([
		t.Literal("pending"),
		t.Literal("verified"),
		t.Literal("failed"),
	]),
	canReceiveEmails: t.Boolean(),
	hasMxRecords: t.Boolean(),
	domainProvider: t.Nullable(t.String()),
	providerConfidence: t.Nullable(t.String()),
	mailFromDomain: t.Optional(t.String()),
	mailFromDomainStatus: t.Optional(t.String()),
	dkimStatus: t.Optional(t.String()),
	dnsRecords: t.Array(DnsRecordSchema),
	dnsConflict: t.Optional(DnsConflictSchema),
	createdAt: t.String({ format: "date-time" }),
	updatedAt: t.String({ format: "date-time" }),
	parentDomain: t.Optional(t.String()),
	message: t.Optional(t.String()),
});

const CreateDomainErrorResponse = t.Object({
	error: t.String(),
	code: t.Optional(t.String()),
});

export const createDomain = new Elysia().post(
	"/domains",
	async ({ request, body, set }) => {
		console.log("➕ POST /api/e2/domains - Starting domain creation");

		// Auth & rate limit validation - throws on error
		const userId = await validateAndRateLimit(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		console.log("📝 Request data:", { domain: body.domain });

		// Validate required fields
		if (!body.domain) {
			console.log("❌ Missing required field: domain");
			set.status = 400;
			return { error: "Domain is required" };
		}

		// Normalize domain (lowercase, trim)
		const domain = body.domain.toLowerCase().trim();

		// Validate domain format
		const domainRegex =
			/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		if (!domainRegex.test(domain) || domain.length > 253) {
			console.log("❌ Invalid domain format:", domain);
			set.status = 400;
			return { error: "Invalid domain format" };
		}

		// Check domain block list
		const blockedDomainResult = await db
			.select({ reason: blockedSignupDomains.reason })
			.from(blockedSignupDomains)
			.where(
				and(
					eq(blockedSignupDomains.domain, domain),
					eq(blockedSignupDomains.isActive, true),
				),
			)
			.limit(1);

		if (blockedDomainResult[0]) {
			set.status = 403;
			return {
				error:
					blockedDomainResult[0].reason ||
					"This domain is blocked from being added to Inbound",
				code: "DOMAIN_BLOCKED",
			};
		}

		// Check if domain already exists on the platform (for any user)
		console.log("🔍 Checking if domain already exists on platform");
		const existingDomainAnyUser = await db
			.select({
				id: emailDomains.id,
				userId: emailDomains.userId,
				status: emailDomains.status,
				createdAt: emailDomains.createdAt,
			})
			.from(emailDomains)
			.where(eq(emailDomains.domain, domain))
			.limit(1);

		if (existingDomainAnyUser[0]) {
			const isOwnDomain = existingDomainAnyUser[0].userId === userId;

			if (isOwnDomain) {
				console.log("❌ Domain already exists for current user:", domain);
				set.status = 409;
				return {
					error: "You have already added this domain to your account",
				};
			} else {
				console.log("❌ Domain already registered by another user:", domain);
				set.status = 409;
				return {
					error:
						"This domain is already registered on our platform. If you believe this is an error or you need to transfer ownership, please contact our support team.",
					code: "DOMAIN_ALREADY_REGISTERED",
				};
			}
		}

		// Check Autumn domain limits
		console.log("🔍 Checking domain limits with Autumn");
		const { data: domainCheck, error: domainCheckError } = await autumn.check({
			customer_id: userId,
			feature_id: "domains",
		});

		if (domainCheckError) {
			console.error("❌ Autumn domain check error:", domainCheckError);
			set.status = 500;
			return { error: "Failed to check domain limits" };
		}

		if (!domainCheck?.allowed) {
			console.log("❌ Domain limit reached for user:", userId);
			set.status = 403;
			return {
				error:
					"Domain limit reached. Please upgrade your plan to add more domains.",
			};
		}

		console.log("✅ Domain limits check passed:", {
			allowed: domainCheck.allowed,
			balance: domainCheck.balance,
			unlimited: domainCheck.unlimited,
		});

		// Check DNS for conflicts (MX/CNAME records) - non-blocking
		console.log("🔍 Checking DNS records for conflicts");
		const dnsResult = await checkDomainCanReceiveEmails(domain);

		// Build DNS conflict info if there are conflicts (but don't block)
		let dnsConflict:
			| {
					hasConflict: boolean;
					conflictType?: "mx" | "cname" | "both";
					message: string;
					existingRecords?: Array<{ type: string; value: string }>;
			  }
			| undefined;

		if (!dnsResult.canReceiveEmails) {
			console.log("⚠️ DNS conflict detected (non-blocking):", dnsResult.error);

			// Determine conflict type and build existing records list
			const existingRecords: Array<{ type: string; value: string }> = [];
			let conflictType: "mx" | "cname" | "both" | undefined;

			if (
				dnsResult.hasMxRecords &&
				dnsResult.mxRecords &&
				dnsResult.mxRecords.length > 0
			) {
				for (const mx of dnsResult.mxRecords) {
					existingRecords.push({
						type: "MX",
						value: `${mx.priority} ${mx.exchange}`,
					});
				}
				conflictType = "mx";
			}

			// Check if error mentions CNAME
			if (dnsResult.error?.toLowerCase().includes("cname")) {
				conflictType = conflictType === "mx" ? "both" : "cname";
			}

			dnsConflict = {
				hasConflict: true,
				conflictType,
				message:
					dnsResult.error ||
					"Domain has existing DNS records that may conflict with email receiving. You'll need to update these records.",
				existingRecords:
					existingRecords.length > 0 ? existingRecords : undefined,
			};
		} else {
			console.log("✅ DNS check passed:", {
				canReceiveEmails: dnsResult.canReceiveEmails,
				hasMxRecords: dnsResult.hasMxRecords,
				provider: dnsResult.provider?.name,
			});
		}

		// Create domain record in database
		console.log("💾 Creating domain record in database");
		const domainRecord = await createDomainVerification(domain, userId, {
			canReceiveEmails: dnsResult.canReceiveEmails,
			hasMxRecords: dnsResult.hasMxRecords,
			provider: dnsResult.provider,
		});

		// Check if this is a subdomain with verified parent
		if (isSubdomain(domain)) {
			const parent = await getVerifiedParentDomain(domain, userId);
			if (parent) {
				console.log(
					`✅ Subdomain detected with verified parent: ${parent.domain}`,
				);

				// Mark domain as verified immediately (inherits from parent)
				// Create timestamp once to ensure consistency between DB and response
				const subdomainVerifiedAt = new Date();
				await db
					.update(emailDomains)
					.set({
						status: "verified",
						verificationToken: null, // Not needed
						updatedAt: subdomainVerifiedAt,
					})
					.where(eq(emailDomains.id, domainRecord.id));

				// Save the MX record to database so it shows in DNS records
				const mxRecordValue = `10 inbound-smtp.${awsRegion}.amazonaws.com`;
				await db.insert(domainDnsRecords).values({
					id: `dns_${nanoid()}`,
					domainId: domainRecord.id,
					recordType: "MX",
					name: domain,
					value: mxRecordValue,
					isRequired: true,
					isVerified: false,
					createdAt: new Date(),
				});
				console.log(`💾 Saved MX record to database for subdomain: ${domain}`);

				// Configure SES batch receipt rule for subdomain receiving
				// This is the same as enabling catch-all - adds the domain to AWS SES batch rule
				let catchAllReceiptRuleName: string | null = null;
				let subdomainUpdatedAt: Date | null = null;

				if (s3BucketName && awsAccountId) {
					try {
						console.log(
							`🔧 Configuring SES receipt rule for subdomain: ${domain}`,
						);

						const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
							lambdaFunctionName,
							awsAccountId,
							awsRegion,
						);

						const batchManager = new BatchRuleManager(
							"inbound-catchall-domain-default",
						);
						const sesManager = new AWSSESReceiptRuleManager(awsRegion);

						// Find or create rule with capacity
						const rule = await batchManager.findOrCreateRuleWithCapacity(1);
						console.log(
							`📋 Using batch rule for subdomain: ${rule.ruleName} (${rule.currentCapacity}/${rule.availableSlots + rule.currentCapacity})`,
						);

						// Add subdomain to batch rule (same as catch-all)
						await sesManager.configureBatchCatchAllRule({
							domains: [domain],
							lambdaFunctionArn: lambdaArn,
							s3BucketName,
							ruleSetName: "inbound-catchall-domain-default",
							ruleName: rule.ruleName,
						});

						// Increment rule capacity
						await batchManager.incrementRuleCapacity(rule.id, 1);

						catchAllReceiptRuleName = rule.ruleName;
						console.log(
							`✅ Subdomain ${domain} added to SES batch rule: ${rule.ruleName}`,
						);

						// Create timestamp once to ensure consistency between DB and response
						const receiptRuleUpdateTime = new Date();
						// Update domain with receipt rule name
						await db
							.update(emailDomains)
							.set({
								catchAllReceiptRuleName: catchAllReceiptRuleName,
								updatedAt: receiptRuleUpdateTime,
							})
							.where(eq(emailDomains.id, domainRecord.id));
						console.log(
							`💾 Updated domain with receipt rule: ${catchAllReceiptRuleName}`,
						);

						// Store the update time for response
						subdomainUpdatedAt = receiptRuleUpdateTime;
					} catch (sesError) {
						console.error(
							`⚠️ Failed to configure SES receipt rule for subdomain ${domain}:`,
							sesError,
						);
						// Don't fail the request - domain is created, but may need manual SES setup
						// User can enable catch-all later to trigger receipt rule creation
					}
				} else {
					console.warn(
						`⚠️ AWS configuration incomplete for subdomain ${domain}. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID. Subdomain created but cannot receive emails until catch-all is enabled.`,
					);
				}

				// Return simplified response with only MX record
				// Use the most recent timestamp: receiptRule update > verification update > createdAt
				const responseUpdatedAt = subdomainUpdatedAt || subdomainVerifiedAt;
				const response = {
					id: domainRecord.id,
					domain: domainRecord.domain,
					status: "verified" as const,
					canReceiveEmails: domainRecord.canReceiveEmails || false,
					hasMxRecords: domainRecord.hasMxRecords || false,
					domainProvider: domainRecord.domainProvider,
					providerConfidence: domainRecord.providerConfidence,
					dnsRecords: [
						{
							type: "MX",
							name: domain,
							value: mxRecordValue,
							description:
								"Add this MX record to receive emails at this subdomain",
							isRequired: true,
						},
					],
					dnsConflict,
					createdAt: (domainRecord.createdAt || new Date()).toISOString(),
					updatedAt: responseUpdatedAt.toISOString(),
					parentDomain: parent.domain,
					message: dnsConflict
						? `Subdomain inherits verification from ${parent.domain}. Note: ${dnsConflict.message}`
						: catchAllReceiptRuleName
							? `Subdomain inherits verification from ${parent.domain}. SES receipt rule configured - ready to receive emails once MX record is added.`
							: `Subdomain inherits verification from ${parent.domain}. Only MX record needed for receiving.`,
				};

				console.log(
					`✅ Subdomain created with parent verification: ${domain} inherits from ${parent.domain}${catchAllReceiptRuleName ? `, SES rule: ${catchAllReceiptRuleName}` : ""}`,
				);
				set.status = 201;
				return response;
			}
		}

		// Initiate SES verification (includes tenant association for new domains)
		console.log(
			"🔐 Initiating SES domain verification with tenant integration",
		);
		const verificationResult = await initiateDomainVerification(domain, userId);

		// Configure SES batch receipt rule for domain receiving
		// This adds the domain to AWS SES batch rule so it can receive emails
		let catchAllReceiptRuleName: string | null = null;

		if (s3BucketName && awsAccountId) {
			try {
				console.log(`🔧 Configuring SES receipt rule for domain: ${domain}`);

				const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
					lambdaFunctionName,
					awsAccountId,
					awsRegion,
				);

				const batchManager = new BatchRuleManager(
					"inbound-catchall-domain-default",
				);
				const sesManager = new AWSSESReceiptRuleManager(awsRegion);

				// Find or create rule with capacity
				const rule = await batchManager.findOrCreateRuleWithCapacity(1);
				console.log(
					`📋 Using batch rule for domain: ${rule.ruleName} (${rule.currentCapacity}/${rule.availableSlots + rule.currentCapacity})`,
				);

				// Add domain to batch rule (catch-all for this domain)
				await sesManager.configureBatchCatchAllRule({
					domains: [domain],
					lambdaFunctionArn: lambdaArn,
					s3BucketName,
					ruleSetName: "inbound-catchall-domain-default",
					ruleName: rule.ruleName,
				});

				// Increment rule capacity
				await batchManager.incrementRuleCapacity(rule.id, 1);

				catchAllReceiptRuleName = rule.ruleName;
				console.log(
					`✅ Domain ${domain} added to SES batch rule: ${rule.ruleName}`,
				);

				// Update domain with receipt rule name
				await db
					.update(emailDomains)
					.set({
						catchAllReceiptRuleName: catchAllReceiptRuleName,
						updatedAt: new Date(),
					})
					.where(eq(emailDomains.id, domainRecord.id));
				console.log(
					`💾 Updated domain with receipt rule: ${catchAllReceiptRuleName}`,
				);
			} catch (sesError) {
				console.error(
					`⚠️ Failed to configure SES receipt rule for domain ${domain}:`,
					sesError,
				);
				// Don't fail the request - domain is created, but may need manual SES setup
			}
		} else {
			console.warn(
				`⚠️ AWS configuration incomplete for domain ${domain}. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID.`,
			);
		}

		// Track domain usage with Autumn (only if not unlimited)
		if (!domainCheck.unlimited) {
			console.log("📊 Tracking domain usage with Autumn");
			const { error: trackError } = await autumn.track({
				customer_id: userId,
				feature_id: "domains",
				value: 1,
			});

			if (trackError) {
				console.error("⚠️ Failed to track domain usage:", trackError);
				// Don't fail the request, just log the warning
			}
		}

		// Format response
		const response = {
			id: domainRecord.id,
			domain: domainRecord.domain,
			status: verificationResult.status as "pending" | "verified" | "failed",
			canReceiveEmails: domainRecord.canReceiveEmails || false,
			hasMxRecords: domainRecord.hasMxRecords || false,
			domainProvider: domainRecord.domainProvider,
			providerConfidence: domainRecord.providerConfidence,
			mailFromDomain: verificationResult.mailFromDomain,
			mailFromDomainStatus: verificationResult.mailFromDomainStatus,
			dkimStatus: verificationResult.dkimStatus,
			dnsRecords: verificationResult.dnsRecords.map((record) => ({
				type: record.type,
				name: record.name,
				value: record.value,
				description: record.description,
				isRequired: true,
			})),
			dnsConflict,
			createdAt: (domainRecord.createdAt || new Date()).toISOString(),
			updatedAt: (domainRecord.updatedAt || new Date()).toISOString(),
			message: dnsConflict
				? `Domain created with DNS conflict warning: ${dnsConflict.message}`
				: catchAllReceiptRuleName
					? `Domain created. SES receipt rule configured - ready to receive emails once DNS records are verified.`
					: undefined,
		};

		console.log("✅ Successfully created domain:", domainRecord.id);
		set.status = 201;
		return response;
	},
	{
		body: CreateDomainBody,
		response: {
			201: CreateDomainResponse,
			400: CreateDomainErrorResponse,
			401: CreateDomainErrorResponse,
			403: CreateDomainErrorResponse,
			409: CreateDomainErrorResponse,
			500: CreateDomainErrorResponse,
		},
		detail: {
			tags: ["Domains"],
			summary: "Create new domain",
			description:
				"Add a new domain for email receiving. Automatically initiates verification and returns required DNS records. Subdomains inherit verification from their verified parent domain.",
		},
	},
);
