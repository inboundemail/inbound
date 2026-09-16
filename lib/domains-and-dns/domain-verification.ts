import {
	DeleteIdentityCommand,
	GetIdentityDkimAttributesCommand,
	GetIdentityMailFromDomainAttributesCommand,
	GetIdentityVerificationAttributesCommand,
	SESClient,
	SetIdentityMailFromDomainCommand,
	VerifyDomainDkimCommand,
	VerifyDomainIdentityCommand,
} from "@aws-sdk/client-ses";
import {
	associateIdentityWithUserTenant,
	getUserTenant,
} from "@/lib/aws-ses/aws-ses-tenants";
import {
	getDomainWithRecords,
	getVerifiedParentDomain,
	updateDomainSesVerification,
} from "@/lib/db/domains";
import { isSubdomain } from "@/lib/domains-and-dns/domain-utils";

// Check if AWS credentials are available
const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESClient | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
	sesClient = new SESClient({
		region: awsRegion,
		credentials: {
			accessKeyId: awsAccessKeyId,
			secretAccessKey: awsSecretAccessKey,
		},
	});
} else {
	console.warn(
		"AWS credentials not configured. SES verification will not work.",
	);
}

export interface DomainVerificationResult {
	domain: string;
	domainId: string;
	verificationToken: string | null;
	status: "pending" | "verified" | "failed";
	sesStatus?: string;
	mailFromDomain?: string;
	mailFromDomainStatus?: string;
	dkimStatus?: string;
	dnsRecords: Array<{
		type: string;
		name: string;
		value: string;
		isVerified: boolean;
		description?: string;
	}>;
	canProceed: boolean;
	error?: string;
	parentDomain?: string;
	isSubdomain?: boolean;
}

export interface EasyDkimResult {
	status: string;
	dnsRecords: Array<{
		type: "CNAME";
		name: string;
		value: string;
		description: string;
	}>;
}

export async function enableEasyDkim(domain: string): Promise<EasyDkimResult> {
	if (!sesClient) {
		throw new Error("AWS SES not configured");
	}

	const response = await sesClient.send(
		new VerifyDomainDkimCommand({ Domain: domain }),
	);
	const attributesResponse = await sesClient.send(
		new GetIdentityDkimAttributesCommand({ Identities: [domain] }),
	);
	const attributes = attributesResponse.DkimAttributes?.[domain];
	const tokens = attributes?.DkimTokens || response.DkimTokens || [];

	if (tokens.length === 0) {
		throw new Error("AWS SES did not return Easy DKIM tokens");
	}

	return {
		status: attributes?.DkimVerificationStatus || "Pending",
		dnsRecords: tokens.map((token) => ({
			type: "CNAME",
			name: `${token}._domainkey.${domain}`,
			value: `${token}.dkim.amazonses.com`,
			description: "Easy DKIM signing record",
		})),
	};
}

/**
 * Initiate domain verification with AWS SES and generate DNS records
 * Now automatically sets up MAIL FROM domain to remove "via amazonses.com"
 */
export async function initiateDomainVerification(
	domain: string,
	userId: string,
): Promise<DomainVerificationResult> {
	try {
		// Get domain record from database
		const domainRecord = await getDomainWithRecords(domain, userId);
		if (!domainRecord) {
			throw new Error("Domain not found in database");
		}

		// Check if AWS credentials are configured
		if (!sesClient) {
			return {
				domain,
				domainId: domainRecord.id,
				verificationToken: "",
				status: "pending",
				dnsRecords: [],
				canProceed: false,
				error:
					"AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.",
			};
		}

		// Validate domain format
		const domainRegex =
			/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		if (!domainRegex.test(domain) || domain.length > 253) {
			throw new Error("Invalid domain format");
		}

		// NEW: Check if this is a subdomain with verified parent
		if (isSubdomain(domain)) {
			const parentDomain = await getVerifiedParentDomain(domain, userId);

			if (parentDomain) {
				console.log(
					`✅ Parent domain ${parentDomain.domain} is verified, skipping SES verification for ${domain}`,
				);

				// Return simplified DNS records - only need MX for receiving
				const dnsRecords = [
					{
						type: "MX",
						name: domain,
						value: `10 inbound-smtp.${awsRegion}.amazonaws.com`,
						isVerified: false,
						description:
							"Inbound email routing (parent domain already verified for sending)",
					},
				];

				// Persist the verification status to the database
				try {
					await updateDomainSesVerification(
						domainRecord.id,
						"", // No verification token needed for subdomains
						"Success", // Set status to verified
						dnsRecords,
						undefined, // No mailFromDomain for subdomains
						undefined, // No mailFromDomainStatus for subdomains
						undefined, // Tenant ID will be handled separately if needed
					);
					console.log(
						`✅ Persisted subdomain verification status to database for ${domain}`,
					);
				} catch (dbError) {
					console.error(
						`❌ Failed to persist subdomain verification status for ${domain}:`,
						dbError,
					);
					// Continue with response even if DB update fails, but log the error
					throw new Error(
						`Failed to update domain status in database: ${dbError instanceof Error ? dbError.message : "Unknown error"}`,
					);
				}

				return {
					domain,
					domainId: domainRecord.id,
					verificationToken: null, // Not needed
					status: "verified", // Inherit from parent
					dnsRecords,
					canProceed: true,
					parentDomain: parentDomain.domain,
					isSubdomain: true,
				};
			}
		}

		// Get or create tenant for user (NEW TENANT INTEGRATION)
		console.log(`🏢 Getting tenant for user: ${userId}`);
		const tenantResult = await getUserTenant(userId);
		if (!tenantResult.success) {
			throw new Error(`Failed to get user tenant: ${tenantResult.error}`);
		}

		const userTenant = tenantResult.tenant;
		console.log(
			`✅ Using tenant: ${userTenant.id} (${userTenant.awsTenantId})`,
		);

		// Verify domain identity with AWS SES (if not already done)
		let verificationToken = domainRecord.verificationToken;
		if (!verificationToken) {
			console.log(`🔐 Creating domain identity in AWS SES: ${domain}`);
			const verifyCommand = new VerifyDomainIdentityCommand({
				Domain: domain,
			});
			const verifyResponse = await sesClient.send(verifyCommand);
			verificationToken = verifyResponse.VerificationToken || "";

			console.log(
				`✅ Domain identity created in AWS SES with token: ${verificationToken ? "***exists***" : "none"}`,
			);

			// IMMEDIATELY associate domain with user's tenant (NEW TENANT INTEGRATION)
			console.log(
				`🔗 Immediately associating domain ${domain} with tenant ${userTenant.tenantName}`,
			);
			const associationResult = await associateIdentityWithUserTenant(
				userId,
				domain,
			);
			if (!associationResult.success) {
				console.error(
					`❌ Failed to associate domain with tenant: ${associationResult.error}`,
				);
				// Continue with domain verification even if tenant association fails
			} else {
				console.log(
					`✅ Domain ${domain} successfully associated with tenant ${userTenant.tenantName}`,
				);
			}
		} else {
			console.log(
				`📋 Domain already has verification token, checking tenant association`,
			);

			// For existing domains, try to associate with tenant if not already done
			const associationResult = await associateIdentityWithUserTenant(
				userId,
				domain,
			);
			if (!associationResult.success) {
				console.warn(
					`⚠️ Could not associate existing domain with tenant: ${associationResult.error}`,
				);
			} else {
				console.log(
					`✅ Existing domain ${domain} associated with tenant ${userTenant.tenantName}`,
				);
			}
		}

		let easyDkim: EasyDkimResult | null = null;
		try {
			easyDkim = await enableEasyDkim(domain);
			console.log(
				`✅ Easy DKIM initialized for ${domain} (${easyDkim.status})`,
			);
		} catch (dkimError) {
			console.error(`Failed to initialize Easy DKIM for ${domain}:`, dkimError);
		}

		// Set up MAIL FROM domain automatically to remove "via amazonses.com"
		const mailFromDomain = `mail.${domain}`;
		let mailFromDomainStatus = "pending";

		try {
			console.log(`🔧 Setting up MAIL FROM domain: ${mailFromDomain}`);
			const mailFromCommand = new SetIdentityMailFromDomainCommand({
				Identity: domain,
				MailFromDomain: mailFromDomain,
				BehaviorOnMXFailure: "UseDefaultValue",
			});
			await sesClient.send(mailFromCommand);

			// Check MAIL FROM domain status
			const mailFromStatusCommand =
				new GetIdentityMailFromDomainAttributesCommand({
					Identities: [domain],
				});
			const mailFromStatusResponse = await sesClient.send(
				mailFromStatusCommand,
			);
			const mailFromAttributes =
				mailFromStatusResponse.MailFromDomainAttributes?.[domain];
			mailFromDomainStatus =
				mailFromAttributes?.MailFromDomainStatus || "pending";

			console.log(
				`✅ MAIL FROM domain configured: ${mailFromDomain} (status: ${mailFromDomainStatus})`,
			);
		} catch (mailFromError) {
			console.error("Failed to set up MAIL FROM domain:", mailFromError);
			// Continue with verification even if MAIL FROM setup fails
		}

		// Get current verification status from AWS
		const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
			Identities: [domain],
		});

		const attributesResponse = await sesClient.send(getAttributesCommand);
		const attributes = attributesResponse.VerificationAttributes?.[domain];

		// Determine verification status
		const sesStatus = attributes?.VerificationStatus || "Pending";
		let status: "pending" | "verified" | "failed" = "pending";

		if (sesStatus === "Success") {
			status = "verified";
		} else if (sesStatus === "Failed") {
			status = "failed";
		}

		// Prepare DNS records that need to be added (including MAIL FROM domain records)
		// Note: Root domain SPF and DMARC are optional - SPF only needed on MAIL FROM subdomain
		const requiredDnsRecords = [
			{
				type: "TXT",
				name: `_amazonses.${domain}`,
				value: verificationToken || "verification-token-not-available",
				description: "SES domain verification",
			},
			{
				type: "MX",
				name: domain,
				value: `10 inbound-smtp.${awsRegion}.amazonaws.com`,
				description: "Inbound email routing",
			},
			// MAIL FROM domain records to eliminate "via amazonses.com"
			{
				type: "MX",
				name: mailFromDomain,
				value: `10 feedback-smtp.${awsRegion}.amazonses.com`,
				description:
					'MAIL FROM domain MX record (eliminates "via amazonses.com")',
			},
			{
				type: "TXT",
				name: mailFromDomain,
				value: "v=spf1 include:amazonses.com ~all",
				description: "SPF record for MAIL FROM domain",
			},
			...(easyDkim?.dnsRecords || []),
		];

		// Update domain record in database with SES information, MAIL FROM domain, and tenant ID
		if (!domainRecord.verificationToken) {
			await updateDomainSesVerification(
				domainRecord.id,
				verificationToken,
				sesStatus,
				requiredDnsRecords,
				mailFromDomain,
				mailFromDomainStatus,
				userTenant.id, // NEW: Store tenant ID with domain
			);
		}

		// Return the DNS records that need to be added
		const dnsRecords = requiredDnsRecords.map((record) => ({
			type: record.type,
			name: record.name,
			value: record.value,
			isVerified: false, // New domains won't have verified DNS records yet
			description: record.description,
		}));

		return {
			domain,
			domainId: domainRecord.id,
			verificationToken: verificationToken || "",
			status,
			sesStatus,
			dkimStatus: easyDkim?.status,
			mailFromDomain,
			mailFromDomainStatus,
			dnsRecords,
			canProceed: status === "verified",
		};
	} catch (error) {
		console.error("Domain verification error:", error);

		// Handle specific AWS errors
		if (error instanceof Error) {
			if (error.name === "InvalidParameterValue") {
				throw new Error("Invalid domain parameter");
			}
			if (error.name === "LimitExceededException") {
				throw new Error("AWS SES limit exceeded");
			}
		}

		throw new Error("Failed to verify domain with AWS SES");
	}
}

export async function deleteIdentityFromSES(
	identity: string,
): Promise<{ success: boolean; alreadyDeleted?: boolean; error?: string }> {
	try {
		if (!sesClient) {
			return {
				success: false,
				error:
					"AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.",
			};
		}

		const normalizedIdentity = identity.toLowerCase().trim();
		const domainRegex =
			/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (
			normalizedIdentity.length > 320 ||
			(!domainRegex.test(normalizedIdentity) &&
				!emailRegex.test(normalizedIdentity))
		) {
			return {
				success: false,
				error: "Invalid SES identity format",
			};
		}

		console.log(`🗑️ Deleting SES identity: ${normalizedIdentity}`);

		const deleteCommand = new DeleteIdentityCommand({
			Identity: normalizedIdentity,
		});

		await sesClient.send(deleteCommand);

		console.log(`✅ Successfully deleted SES identity: ${normalizedIdentity}`);

		return { success: true };
	} catch (error) {
		console.error("SES identity deletion error:", error);

		if (error instanceof Error) {
			if (error.name === "InvalidParameterValue") {
				return {
					success: false,
					error: "Invalid SES identity parameter",
				};
			}

			if (error.name === "NotFoundException") {
				console.log(`⚠️ SES identity not found (already deleted): ${identity}`);
				return { success: true, alreadyDeleted: true };
			}
		}

		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to delete identity from AWS SES",
		};
	}
}

/**
 * Delete domain identity from AWS SES
 */
export async function deleteDomainFromSES(
	domain: string,
): Promise<{ success: boolean; error?: string }> {
	const result = await deleteIdentityFromSES(domain);

	if (!result.success) {
		return {
			success: false,
			error: result.error,
		};
	}

	return { success: true };
}
