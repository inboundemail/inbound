import {
	GetConfigurationSetCommand,
	GetEmailIdentityCommand,
	GetSuppressedDestinationCommand,
	GetTenantCommand,
	SESv2Client,
} from "@aws-sdk/client-sesv2";
import * as dotenv from "dotenv";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	or,
	sql,
	type SQL,
} from "drizzle-orm";

dotenv.config();

type TimeRange = "24h" | "7d" | "30d";
type InvestigationCommand =
	| "overview"
	| "tenant"
	| "domain"
	| "account"
	| "suppression"
	| "help";

type RiskProfile = {
	score: number;
	flags: string[];
	suspicious: boolean;
};

type TenantInsight = {
	id: string;
	userId: string;
	awsTenantId: string;
	tenantName: string;
	configurationSetName: string | null;
	status: string;
	reputationPolicy: string;
	createdAt: string | null;
	updatedAt: string | null;
	user: {
		id: string;
		name: string | null;
		email: string | null;
		banned: boolean | null;
		banReason: string | null;
		banExpires: string | null;
	};
	domains: Array<{
		id: string;
		domain: string;
		status: string;
		canReceiveEmails: boolean | null;
	}>;
	stats: {
		timeRange: TimeRange;
		sent: number;
		failedSends: number;
		bounces: number;
		complaints: number;
		deliveryFailures: number;
		bounceRate: number;
		complaintRate: number;
		uniqueFailedRecipients: number;
		lastSentAt: string | null;
		lastDeliveryEventAt: string | null;
		topRejectedRecipientDomains: Array<{ domain: string; count: number }>;
	};
	risk: RiskProfile;
};

type CommonCliOptions = {
	asJson: boolean;
	timeRange: TimeRange;
	limit: number;
	withAws: boolean;
	awsRegion: string;
};

type OverviewCliInput = CommonCliOptions & {
	command: "overview";
	search?: string;
	flaggedOnly: boolean;
};

type TenantCliInput = CommonCliOptions & {
	command: "tenant";
	tenantId: string;
};

type DomainCliInput = CommonCliOptions & {
	command: "domain";
	domainId?: string;
	domain?: string;
};

type AccountCliInput = CommonCliOptions & {
	command: "account";
	userId?: string;
	email?: string;
};

type SuppressionCliInput = CommonCliOptions & {
	command: "suppression";
	email: string;
};

type HelpCliInput = {
	command: "help";
};

type CliInput =
	| OverviewCliInput
	| TenantCliInput
	| DomainCliInput
	| AccountCliInput
	| SuppressionCliInput
	| HelpCliInput;

type AwsTenantStatus = {
	tenantFound: boolean;
	awsTenantId: string | null;
	sendingStatus: string | null;
	configurationSetFound: boolean | null;
	configurationSetSendingEnabled: boolean | null;
	errors: string[];
};

type AwsDomainStatus = {
	identityFound: boolean;
	verifiedForSending: boolean | null;
	dkimStatus: string | null;
	mailFromStatus: string | null;
	errors: string[];
};

type OverviewResult = {
	command: "overview";
	generatedAt: string;
	timeRange: TimeRange;
	summary: {
		scannedTenants: number;
		returnedTenants: number;
		flaggedTenants: number;
		totalSent: number;
		totalFailedSends: number;
		totalBounces: number;
		totalComplaints: number;
		totalDeliveryFailures: number;
		bounceRateOverall: number;
		complaintRateOverall: number;
	};
	tenants: Array<
		TenantInsight & {
			awsStatus?: AwsTenantStatus;
		}
	>;
};

type TenantResult = {
	command: "tenant";
	generatedAt: string;
	timeRange: TimeRange;
	tenant: TenantInsight & {
		rateLimitOverride: {
			hourlyLimit: number | null;
			isActive: boolean;
			reason: string | null;
			expiresAt: string | null;
			updatedAt: string | null;
		} | null;
		guard: {
			totalStructuredEmails: number;
			guardBlockedCount: number;
			guardBlockedRate: number;
			lastGuardBlockedAt: string | null;
		};
		recentSentEmails: Array<{
			id: string;
			fromAddress: string;
			fromDomain: string;
			status: string;
			subject: string | null;
			createdAt: string | null;
		}>;
		recentDeliveryEvents: Array<{
			id: string;
			eventType: string;
			failedRecipient: string;
			failedRecipientDomain: string | null;
			statusCode: string | null;
			createdAt: string | null;
		}>;
		blockedSignupDomains: string[];
		awsTenantStatus?: AwsTenantStatus;
		awsDomainStatuses?: Array<{ domain: string; aws: AwsDomainStatus }>;
	};
};

type AccountResult = {
	command: "account";
	generatedAt: string;
	timeRange: TimeRange;
	account: {
		id: string;
		name: string | null;
		email: string;
		banned: boolean | null;
		banReason: string | null;
		banExpires: string | null;
		tenant: TenantInsight | null;
		domains: Array<{
			id: string;
			domain: string;
			status: string;
			canReceiveEmails: boolean | null;
		}>;
		risk: RiskProfile;
		stats: {
			sent: number;
			failedSends: number;
			bounces: number;
			complaints: number;
			deliveryFailures: number;
			bounceRate: number;
			complaintRate: number;
			lastSentAt: string | null;
			lastDeliveryEventAt: string | null;
			topRejectedRecipientDomains: Array<{ domain: string; count: number }>;
		};
		guard: {
			totalStructuredEmails: number;
			guardBlockedCount: number;
			guardBlockedRate: number;
			lastGuardBlockedAt: string | null;
		};
		rateLimitOverride: {
			hourlyLimit: number | null;
			isActive: boolean;
			reason: string | null;
			expiresAt: string | null;
			updatedAt: string | null;
		} | null;
		blockedSignupDomains: string[];
		recentSentEmails: Array<{
			id: string;
			fromAddress: string;
			fromDomain: string;
			status: string;
			subject: string | null;
			createdAt: string | null;
		}>;
		recentDeliveryEvents: Array<{
			id: string;
			eventType: string;
			failedRecipient: string;
			failedRecipientDomain: string | null;
			statusCode: string | null;
			createdAt: string | null;
		}>;
		awsTenantStatus?: AwsTenantStatus;
		awsDomainStatuses?: Array<{ domain: string; aws: AwsDomainStatus }>;
	};
};

type DomainResult = {
	command: "domain";
	generatedAt: string;
	timeRange: TimeRange;
	domain: {
		id: string;
		domain: string;
		status: string;
		canReceiveEmails: boolean | null;
		tenantId: string | null;
		userId: string;
		userEmail: string | null;
		userBanned: boolean | null;
		tenantName: string | null;
		tenantStatus: string | null;
		blockedSignup: {
			isActive: boolean;
			reason: string | null;
			blockedBy: string | null;
			updatedAt: string | null;
		} | null;
		stats: {
			sent: number;
			failedSends: number;
			bounces: number;
			complaints: number;
			deliveryFailures: number;
			bounceRate: number;
			complaintRate: number;
			lastSentAt: string | null;
			lastDeliveryEventAt: string | null;
		};
		guard: {
			receivedCount: number;
			guardBlockedCount: number;
			guardBlockedRate: number;
			lastGuardBlockedAt: string | null;
		};
		recentDeliveryEvents: Array<{
			id: string;
			eventType: string;
			failedRecipient: string;
			failedRecipientDomain: string | null;
			statusCode: string | null;
			createdAt: string | null;
		}>;
		awsDomainStatus?: AwsDomainStatus;
		awsTenantStatus?: AwsTenantStatus;
		risk: RiskProfile;
	};
};

type SuppressionResult = {
	command: "suppression";
	generatedAt: string;
	email: string;
	domain: string | null;
	awsRegion: string;
	awsSuppression: {
		suppressed: boolean;
		reason: string | null;
		lastUpdateTime: string | null;
		attributes: Record<string, string> | null;
		error: string | null;
	};
	localSignals: {
		totalEvents: number;
		bounces: number;
		complaints: number;
		deliveryFailures: number;
		lastEventAt: string | null;
		lastStatusCode: string | null;
		lastDiagnosticCode: string | null;
		blockedEmail: {
			reason: string | null;
			blockedBy: string | null;
			updatedAt: string | null;
		} | null;
		blockedSignupDomain: {
			reason: string | null;
			blockedBy: string | null;
			updatedAt: string | null;
		} | null;
	};
};

type InvestigationResult =
	| OverviewResult
	| TenantResult
	| AccountResult
	| DomainResult
	| SuppressionResult;

type DbDeps = {
	db: typeof import("@/lib/db").db;
	user: typeof import("@/lib/db/auth-schema").user;
	tables: Pick<
		typeof import("@/lib/db/schema"),
		| "blockedEmails"
		| "blockedSignupDomains"
		| "emailDeliveryEvents"
		| "emailDomains"
		| "rateLimitOverrides"
		| "sentEmails"
		| "sesTenants"
		| "structuredEmails"
	>;
};

let dbDepsPromise: Promise<DbDeps> | null = null;

async function loadDbDeps(): Promise<DbDeps> {
	if (!dbDepsPromise) {
		dbDepsPromise = (async () => {
			const [{ db }, { user }, schema] = await Promise.all([
				import("@/lib/db"),
				import("@/lib/db/auth-schema"),
				import("@/lib/db/schema"),
			]);

			return {
				db,
				user,
				tables: {
					blockedEmails: schema.blockedEmails,
					blockedSignupDomains: schema.blockedSignupDomains,
					emailDeliveryEvents: schema.emailDeliveryEvents,
					emailDomains: schema.emailDomains,
					rateLimitOverrides: schema.rateLimitOverrides,
					sentEmails: schema.sentEmails,
					sesTenants: schema.sesTenants,
					structuredEmails: schema.structuredEmails,
				},
			};
		})();
	}

	return dbDepsPromise;
}

function getOptionValue(args: string[], flag: string): string | undefined {
	const inline = args.find((arg) => arg.startsWith(`${flag}=`));
	if (inline) {
		return inline.slice(flag.length + 1);
	}

	const index = args.indexOf(flag);
	if (index === -1 || index === args.length - 1) {
		return undefined;
	}

	return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function parseTimeRange(value: string | undefined): TimeRange {
	if (value === "24h" || value === "7d" || value === "30d") {
		return value;
	}

	return "7d";
}

function toNumber(value: unknown): number {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	return 0;
}

function toIso(value: unknown): string | null {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "string") {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
	}

	return null;
}

export function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function getRangeStart(range: TimeRange): Date {
	const now = Date.now();
	if (range === "24h") {
		return new Date(now - 24 * 60 * 60 * 1000);
	}
	if (range === "30d") {
		return new Date(now - 30 * 24 * 60 * 60 * 1000);
	}
	return new Date(now - 7 * 24 * 60 * 60 * 1000);
}

function combineWhere(conditions: Array<SQL | undefined>): SQL {
	const filtered = conditions.filter(
		(condition): condition is SQL => condition !== undefined,
	);

	if (filtered.length === 0) {
		return sql`true`;
	}

	if (filtered.length === 1) {
		return filtered[0];
	}

	return and(...filtered) ?? sql`true`;
}

export function buildRiskProfile(args: {
	bounceRate: number;
	complaintRate: number;
	bounces: number;
	complaints: number;
	deliveryFailures: number;
	failedSends: number;
	uniqueFailedRecipients: number;
	topRejectedDomainCount: number;
	userBanned: boolean;
	tenantStatus: string;
}): RiskProfile {
	let score = 0;
	const flags: string[] = [];

	if (args.bounceRate >= 5) {
		flags.push("high_bounce_rate");
		score += 45;
	}

	if (args.bounces >= 50) {
		flags.push("high_bounce_volume");
		score += 20;
	}

	if (args.complaintRate >= 0.1) {
		flags.push("high_complaint_rate");
		score += 30;
	}

	if (args.complaints >= 10) {
		flags.push("high_complaint_volume");
		score += 15;
	}

	if (args.deliveryFailures >= 50) {
		flags.push("high_delivery_failures");
		score += 20;
	}

	if (args.failedSends >= 50) {
		flags.push("high_send_failures");
		score += 15;
	}

	if (args.uniqueFailedRecipients >= 100) {
		flags.push("many_unique_failed_recipients");
		score += 15;
	}

	const rejectionEventTotal = args.bounces + args.deliveryFailures;
	if (
		rejectionEventTotal >= 20 &&
		args.topRejectedDomainCount / rejectionEventTotal >= 0.6
	) {
		flags.push("concentrated_recipient_domain_rejections");
		score += 15;
	}

	if (args.userBanned) {
		flags.push("user_banned");
		score += 25;
	}

	if (args.tenantStatus !== "active") {
		flags.push("tenant_not_active");
		score += 5;
	}

	score = Math.min(100, score);
	return {
		score,
		flags,
		suspicious: score >= 50,
	};
}

function printUsage(): void {
	console.log(`Inbound abuse investigation CLI

Usage:
  bun run investigate -- <command> [options]

Commands:
  overview      List risky tenants and abuse signals
  tenant        Investigate a single tenant deeply
  account       Investigate a single account/user deeply
  domain        Investigate a single domain deeply
  suppression   Check AWS suppression and local suppression signals for an email

Global options:
  --json                  Print JSON output
  --time-range <24h|7d|30d>   Time window for metrics (default: 7d)
  --limit <n>             Max results for overview (default: 25)
  --with-aws              Enrich with AWS SES checks
  --aws-region <region>   AWS region for SES checks (default: AWS_REGION or us-east-2)
  --help                  Show help

overview options:
  --search <text>         Search tenant/user identifiers
  --flagged-only          Only return suspicious tenants

tenant options:
  --tenant-id <id>        Required tenant ID

account options:
  --user-id <id>          User ID selector
  --email <email>         User email selector

domain options:
  --domain-id <id>        Domain ID selector
  --domain <name>         Domain selector

suppression options:
  --email <email>         Required recipient email

Examples:
  bun run investigate -- overview --flagged-only --limit 20 --with-aws
  bun run investigate -- tenant --tenant-id tenant_123 --with-aws
  bun run investigate -- account --email abuse@example.com --time-range 30d
  bun run investigate -- domain --domain spam-domain.com --with-aws
  bun run investigate -- suppression --email victim@example.com --with-aws --json
`);
}

export function parseCliInput(args: string[]): CliInput {
	const command = args[0] as InvestigationCommand | undefined;
	if (!command || hasFlag(args, "--help") || command === "help") {
		return { command: "help" };
	}

	const common: CommonCliOptions = {
		asJson: hasFlag(args, "--json"),
		timeRange: parseTimeRange(getOptionValue(args, "--time-range")),
		limit: Math.min(parsePositiveInt(getOptionValue(args, "--limit"), 25), 100),
		withAws: hasFlag(args, "--with-aws"),
		awsRegion: getOptionValue(args, "--aws-region") || process.env.AWS_REGION || "us-east-2",
	};

	if (command === "overview") {
		return {
			command,
			...common,
			search: getOptionValue(args, "--search")?.trim() || undefined,
			flaggedOnly: hasFlag(args, "--flagged-only"),
		};
	}

	if (command === "tenant") {
		const tenantId = getOptionValue(args, "--tenant-id");
		if (!tenantId) {
			throw new Error("Missing required --tenant-id for tenant command");
		}

		return {
			command,
			...common,
			tenantId,
		};
	}

	if (command === "domain") {
		const domainId = getOptionValue(args, "--domain-id");
		const domain = getOptionValue(args, "--domain")?.trim().toLowerCase();
		if (!domainId && !domain) {
			throw new Error("Provide --domain-id or --domain for domain command");
		}

		return {
			command,
			...common,
			domainId,
			domain,
		};
	}

	if (command === "account") {
		const userId = getOptionValue(args, "--user-id");
		const email = getOptionValue(args, "--email")?.trim().toLowerCase();
		if (!userId && !email) {
			throw new Error("Provide --user-id or --email for account command");
		}

		return {
			command,
			...common,
			userId,
			email,
		};
	}

	if (command === "suppression") {
		const email = getOptionValue(args, "--email")?.trim().toLowerCase();
		if (!email) {
			throw new Error("Missing required --email for suppression command");
		}

		return {
			command,
			...common,
			email,
		};
	}

	throw new Error(`Unknown command '${command}'`);
}

function getErrorName(error: unknown): string {
	if (typeof error !== "object" || error === null || !("name" in error)) {
		return "UnknownError";
	}

	const name = (error as { name?: unknown }).name;
	return typeof name === "string" ? name : "UnknownError";
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error !== "object" || error === null || !("message" in error)) {
		return "Unknown error";
	}

	const message = (error as { message?: unknown }).message;
	return typeof message === "string" ? message : "Unknown error";
}

function isAwsNotFoundError(error: unknown): boolean {
	const lowered = getErrorName(error).toLowerCase();
	return lowered.includes("notfound");
}

function createSesClient(region: string): SESv2Client {
	return new SESv2Client({ region });
}

async function fetchAwsTenantStatus(
	sesClient: SESv2Client,
	tenantName: string,
	configurationSetName: string | null,
): Promise<AwsTenantStatus> {
	const errors: string[] = [];
	let tenantFound = false;
	let awsTenantId: string | null = null;
	let sendingStatus: string | null = null;
	let configurationSetFound: boolean | null = null;
	let configurationSetSendingEnabled: boolean | null = null;

	try {
		const tenant = await sesClient.send(
			new GetTenantCommand({
				TenantName: tenantName,
			}),
		);
		tenantFound = true;
		awsTenantId = tenant.Tenant?.TenantId ?? null;
		sendingStatus = tenant.Tenant?.SendingStatus ?? null;
	} catch (error) {
		if (!isAwsNotFoundError(error)) {
			errors.push(`GetTenant: ${getErrorName(error)} ${getErrorMessage(error)}`);
		}
	}

	if (configurationSetName) {
		try {
			const configurationSet = await sesClient.send(
				new GetConfigurationSetCommand({
					ConfigurationSetName: configurationSetName,
				}),
			);
			configurationSetFound = true;
			configurationSetSendingEnabled =
				configurationSet.SendingOptions?.SendingEnabled ?? null;
		} catch (error) {
			configurationSetFound = false;
			configurationSetSendingEnabled = null;
			if (!isAwsNotFoundError(error)) {
				errors.push(
					`GetConfigurationSet: ${getErrorName(error)} ${getErrorMessage(error)}`,
				);
			}
		}
	}

	return {
		tenantFound,
		awsTenantId,
		sendingStatus,
		configurationSetFound,
		configurationSetSendingEnabled,
		errors,
	};
}

async function fetchAwsDomainStatus(
	sesClient: SESv2Client,
	domain: string,
): Promise<AwsDomainStatus> {
	const errors: string[] = [];
	let identityFound = false;
	let verifiedForSending: boolean | null = null;
	let dkimStatus: string | null = null;
	let mailFromStatus: string | null = null;

	try {
		const identity = await sesClient.send(
			new GetEmailIdentityCommand({
				EmailIdentity: domain,
			}),
		);
		identityFound = true;
		verifiedForSending = identity.VerifiedForSendingStatus ?? null;
		dkimStatus = identity.DkimAttributes?.Status ?? null;
		mailFromStatus = identity.MailFromAttributes?.MailFromDomainStatus ?? null;
	} catch (error) {
		if (!isAwsNotFoundError(error)) {
			errors.push(
				`GetEmailIdentity: ${getErrorName(error)} ${getErrorMessage(error)}`,
			);
		}
	}

	return {
		identityFound,
		verifiedForSending,
		dkimStatus,
		mailFromStatus,
		errors,
	};
}

async function listTenantInsights(params: {
	timeRange: TimeRange;
	search?: string;
	tenantIds?: string[];
	userIds?: string[];
}): Promise<TenantInsight[]> {
	const { db, user, tables } = await loadDbDeps();
	const { emailDeliveryEvents, emailDomains, sentEmails, sesTenants } = tables;
	const rangeStart = getRangeStart(params.timeRange);

	const searchCondition =
		params.search && params.search.length > 0
			? or(
					ilike(sesTenants.tenantName, `%${params.search}%`),
					ilike(sesTenants.id, `%${params.search}%`),
					ilike(sesTenants.awsTenantId, `%${params.search}%`),
					ilike(user.email, `%${params.search}%`),
					ilike(user.name, `%${params.search}%`),
				)
			: undefined;

	const tenantFilter =
		params.tenantIds && params.tenantIds.length > 0
			? inArray(sesTenants.id, params.tenantIds)
			: undefined;

	const userFilter =
		params.userIds && params.userIds.length > 0
			? inArray(sesTenants.userId, params.userIds)
			: undefined;

	const whereClause = combineWhere([searchCondition, tenantFilter, userFilter]);

	const tenantRows = await db
		.select({
			id: sesTenants.id,
			userId: sesTenants.userId,
			awsTenantId: sesTenants.awsTenantId,
			tenantName: sesTenants.tenantName,
			configurationSetName: sesTenants.configurationSetName,
			status: sesTenants.status,
			reputationPolicy: sesTenants.reputationPolicy,
			createdAt: sesTenants.createdAt,
			updatedAt: sesTenants.updatedAt,
			userName: user.name,
			userEmail: user.email,
			userBanned: user.banned,
			userBanReason: user.banReason,
			userBanExpires: user.banExpires,
		})
		.from(sesTenants)
		.leftJoin(user, eq(sesTenants.userId, user.id))
		.where(whereClause)
		.orderBy(desc(sesTenants.createdAt));

	if (tenantRows.length === 0) {
		return [];
	}

	const tenantIds = tenantRows.map((tenant) => tenant.id);
	const userIds = Array.from(new Set(tenantRows.map((tenant) => tenant.userId)));

	const domainRows = tenantIds.length
		? await db
				.select({
					id: emailDomains.id,
					domain: emailDomains.domain,
					status: emailDomains.status,
					canReceiveEmails: emailDomains.canReceiveEmails,
					tenantId: emailDomains.tenantId,
				})
				.from(emailDomains)
				.where(inArray(emailDomains.tenantId, tenantIds))
				.orderBy(asc(emailDomains.domain))
		: [];

	const sentAggregateRows = userIds.length
		? await db
				.select({
					userId: sentEmails.userId,
					sentCount: count(),
					failedCount: sql<number>`sum(case when ${sentEmails.status} = 'failed' then 1 else 0 end)`,
					lastSentAt: sql<Date | null>`max(${sentEmails.createdAt})`,
				})
				.from(sentEmails)
				.where(
					and(inArray(sentEmails.userId, userIds), gte(sentEmails.createdAt, rangeStart)),
				)
				.groupBy(sentEmails.userId)
		: [];

	const deliveryAggregateRows = tenantIds.length
		? await db
				.select({
					tenantId: emailDeliveryEvents.tenantId,
					bounces: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'bounce' then 1 else 0 end)`,
					complaints: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'complaint' then 1 else 0 end)`,
					deliveryFailures: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'delivery_failure' then 1 else 0 end)`,
					uniqueFailedRecipients: sql<number>`count(distinct ${emailDeliveryEvents.failedRecipient})`,
					lastDeliveryEventAt: sql<Date | null>`max(${emailDeliveryEvents.createdAt})`,
				})
				.from(emailDeliveryEvents)
				.where(
					and(
						inArray(emailDeliveryEvents.tenantId, tenantIds),
						gte(emailDeliveryEvents.createdAt, rangeStart),
					),
				)
				.groupBy(emailDeliveryEvents.tenantId)
		: [];

	const rejectedCountSql = sql<number>`count(*)`;
	const rejectedDomainRows = tenantIds.length
		? await db
				.select({
					tenantId: emailDeliveryEvents.tenantId,
					failedRecipientDomain: emailDeliveryEvents.failedRecipientDomain,
					eventCount: rejectedCountSql,
				})
				.from(emailDeliveryEvents)
				.where(
					and(
						inArray(emailDeliveryEvents.tenantId, tenantIds),
						gte(emailDeliveryEvents.createdAt, rangeStart),
						sql`${emailDeliveryEvents.failedRecipientDomain} is not null and ${emailDeliveryEvents.failedRecipientDomain} <> ''`,
					),
				)
				.groupBy(
					emailDeliveryEvents.tenantId,
					emailDeliveryEvents.failedRecipientDomain,
				)
				.orderBy(desc(rejectedCountSql))
		: [];

	const domainsByTenant = new Map<
		string,
		Array<{
			id: string;
			domain: string;
			status: string;
			canReceiveEmails: boolean | null;
		}>
	>();
	for (const domainRow of domainRows) {
		if (!domainRow.tenantId) {
			continue;
		}
		const current = domainsByTenant.get(domainRow.tenantId) || [];
		current.push({
			id: domainRow.id,
			domain: domainRow.domain,
			status: domainRow.status,
			canReceiveEmails: domainRow.canReceiveEmails,
		});
		domainsByTenant.set(domainRow.tenantId, current);
	}

	const sentByUser = new Map<
		string,
		{ sentCount: number; failedCount: number; lastSentAt: string | null }
	>();
	for (const row of sentAggregateRows) {
		sentByUser.set(row.userId, {
			sentCount: toNumber(row.sentCount),
			failedCount: toNumber(row.failedCount),
			lastSentAt: toIso(row.lastSentAt),
		});
	}

	const deliveryByTenant = new Map<
		string,
		{
			bounces: number;
			complaints: number;
			deliveryFailures: number;
			uniqueFailedRecipients: number;
			lastDeliveryEventAt: string | null;
		}
	>();
	for (const row of deliveryAggregateRows) {
		if (!row.tenantId) {
			continue;
		}
		deliveryByTenant.set(row.tenantId, {
			bounces: toNumber(row.bounces),
			complaints: toNumber(row.complaints),
			deliveryFailures: toNumber(row.deliveryFailures),
			uniqueFailedRecipients: toNumber(row.uniqueFailedRecipients),
			lastDeliveryEventAt: toIso(row.lastDeliveryEventAt),
		});
	}

	const rejectedByTenant = new Map<string, Array<{ domain: string; count: number }>>();
	for (const row of rejectedDomainRows) {
		if (!row.tenantId || !row.failedRecipientDomain) {
			continue;
		}
		const current = rejectedByTenant.get(row.tenantId) || [];
		current.push({
			domain: row.failedRecipientDomain,
			count: toNumber(row.eventCount),
		});
		rejectedByTenant.set(row.tenantId, current);
	}

	const insights = tenantRows.map((tenantRow) => {
		const sentStats = sentByUser.get(tenantRow.userId) || {
			sentCount: 0,
			failedCount: 0,
			lastSentAt: null,
		};
		const deliveryStats = deliveryByTenant.get(tenantRow.id) || {
			bounces: 0,
			complaints: 0,
			deliveryFailures: 0,
			uniqueFailedRecipients: 0,
			lastDeliveryEventAt: null,
		};
		const topRejectedRecipientDomains = (rejectedByTenant.get(tenantRow.id) || [])
			.sort((left, right) => right.count - left.count)
			.slice(0, 3);

		const bounceRate =
			sentStats.sentCount > 0
				? round2((deliveryStats.bounces / sentStats.sentCount) * 100)
				: 0;
		const complaintRate =
			sentStats.sentCount > 0
				? round2((deliveryStats.complaints / sentStats.sentCount) * 100)
				: 0;

		const risk = buildRiskProfile({
			bounceRate,
			complaintRate,
			bounces: deliveryStats.bounces,
			complaints: deliveryStats.complaints,
			deliveryFailures: deliveryStats.deliveryFailures,
			failedSends: sentStats.failedCount,
			uniqueFailedRecipients: deliveryStats.uniqueFailedRecipients,
			topRejectedDomainCount: topRejectedRecipientDomains[0]?.count || 0,
			userBanned: tenantRow.userBanned === true,
			tenantStatus: tenantRow.status,
		});

		return {
			id: tenantRow.id,
			userId: tenantRow.userId,
			awsTenantId: tenantRow.awsTenantId,
			tenantName: tenantRow.tenantName,
			configurationSetName: tenantRow.configurationSetName,
			status: tenantRow.status,
			reputationPolicy: tenantRow.reputationPolicy,
			createdAt: toIso(tenantRow.createdAt),
			updatedAt: toIso(tenantRow.updatedAt),
			user: {
				id: tenantRow.userId,
				name: tenantRow.userName,
				email: tenantRow.userEmail,
				banned: tenantRow.userBanned,
				banReason: tenantRow.userBanReason,
				banExpires: toIso(tenantRow.userBanExpires),
			},
			domains: domainsByTenant.get(tenantRow.id) || [],
			stats: {
				timeRange: params.timeRange,
				sent: sentStats.sentCount,
				failedSends: sentStats.failedCount,
				bounces: deliveryStats.bounces,
				complaints: deliveryStats.complaints,
				deliveryFailures: deliveryStats.deliveryFailures,
				bounceRate,
				complaintRate,
				uniqueFailedRecipients: deliveryStats.uniqueFailedRecipients,
				lastSentAt: sentStats.lastSentAt,
				lastDeliveryEventAt: deliveryStats.lastDeliveryEventAt,
				topRejectedRecipientDomains,
			},
			risk,
		} satisfies TenantInsight;
	});

	insights.sort((left, right) => right.risk.score - left.risk.score);
	return insights;
}

function buildOverviewSummary(insights: TenantInsight[]) {
	const summary = insights.reduce(
		(accumulator, tenant) => {
			accumulator.totalSent += tenant.stats.sent;
			accumulator.totalFailedSends += tenant.stats.failedSends;
			accumulator.totalBounces += tenant.stats.bounces;
			accumulator.totalComplaints += tenant.stats.complaints;
			accumulator.totalDeliveryFailures += tenant.stats.deliveryFailures;
			if (tenant.risk.suspicious) {
				accumulator.flaggedTenants += 1;
			}
			return accumulator;
		},
		{
			flaggedTenants: 0,
			totalSent: 0,
			totalFailedSends: 0,
			totalBounces: 0,
			totalComplaints: 0,
			totalDeliveryFailures: 0,
		},
	);

	return {
		...summary,
		bounceRateOverall:
			summary.totalSent > 0
				? round2((summary.totalBounces / summary.totalSent) * 100)
				: 0,
		complaintRateOverall:
			summary.totalSent > 0
				? round2((summary.totalComplaints / summary.totalSent) * 100)
				: 0,
	};
}

async function runOverviewCommand(input: OverviewCliInput): Promise<OverviewResult> {
	const tenantInsights = await listTenantInsights({
		timeRange: input.timeRange,
		search: input.search,
	});
	const filtered = input.flaggedOnly
		? tenantInsights.filter((tenant) => tenant.risk.suspicious)
		: tenantInsights;
	const limited = filtered.slice(0, input.limit);
	const summary = buildOverviewSummary(filtered);

	if (input.withAws) {
		const sesClient = createSesClient(input.awsRegion);
		const enriched = await Promise.all(
			limited.map(async (tenant) => ({
				...tenant,
				awsStatus: await fetchAwsTenantStatus(
					sesClient,
					tenant.tenantName,
					tenant.configurationSetName,
				),
			})),
		);

		return {
			command: "overview",
			generatedAt: new Date().toISOString(),
			timeRange: input.timeRange,
			summary: {
				scannedTenants: tenantInsights.length,
				returnedTenants: enriched.length,
				...summary,
			},
			tenants: enriched,
		};
	}

	return {
		command: "overview",
		generatedAt: new Date().toISOString(),
		timeRange: input.timeRange,
		summary: {
			scannedTenants: tenantInsights.length,
			returnedTenants: limited.length,
			...summary,
		},
		tenants: limited,
	};
}

async function runTenantCommand(input: TenantCliInput): Promise<TenantResult> {
	const { db, tables } = await loadDbDeps();
	const { blockedSignupDomains, emailDeliveryEvents, rateLimitOverrides, sentEmails, structuredEmails } =
		tables;

	const insights = await listTenantInsights({
		timeRange: input.timeRange,
		tenantIds: [input.tenantId],
	});
	const tenant = insights[0];
	if (!tenant) {
		throw new Error(`Tenant '${input.tenantId}' not found`);
	}

	const rangeStart = getRangeStart(input.timeRange);
	const [rateOverride] = await db
		.select({
			hourlyLimit: rateLimitOverrides.hourlyLimit,
			isActive: rateLimitOverrides.isActive,
			reason: rateLimitOverrides.reason,
			expiresAt: rateLimitOverrides.expiresAt,
			updatedAt: rateLimitOverrides.updatedAt,
		})
		.from(rateLimitOverrides)
		.where(eq(rateLimitOverrides.userId, tenant.user.id))
		.limit(1);

	const [guardAggregate] = await db
		.select({
			totalCount: count(),
			guardBlockedCount: sql<number>`sum(case when ${structuredEmails.guardBlocked} = true then 1 else 0 end)`,
			lastGuardBlockedAt: sql<Date | null>`max(case when ${structuredEmails.guardBlocked} = true then ${structuredEmails.createdAt} else null end)`,
		})
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.userId, tenant.user.id),
				gte(structuredEmails.createdAt, rangeStart),
			),
		);

	const recentSentEmails = await db
		.select({
			id: sentEmails.id,
			fromAddress: sentEmails.fromAddress,
			fromDomain: sentEmails.fromDomain,
			status: sentEmails.status,
			subject: sentEmails.subject,
			createdAt: sentEmails.createdAt,
		})
		.from(sentEmails)
		.where(
			and(eq(sentEmails.userId, tenant.user.id), gte(sentEmails.createdAt, rangeStart)),
		)
		.orderBy(desc(sentEmails.createdAt))
		.limit(20);

	const recentDeliveryEvents = await db
		.select({
			id: emailDeliveryEvents.id,
			eventType: emailDeliveryEvents.eventType,
			failedRecipient: emailDeliveryEvents.failedRecipient,
			failedRecipientDomain: emailDeliveryEvents.failedRecipientDomain,
			statusCode: emailDeliveryEvents.statusCode,
			createdAt: emailDeliveryEvents.createdAt,
		})
		.from(emailDeliveryEvents)
		.where(
			and(
				eq(emailDeliveryEvents.tenantId, tenant.id),
				gte(emailDeliveryEvents.createdAt, rangeStart),
			),
		)
		.orderBy(desc(emailDeliveryEvents.createdAt))
		.limit(20);

	const domainNames = tenant.domains.map((domainRow) => domainRow.domain);
	const blockedDomainRows =
		domainNames.length > 0
			? await db
					.select({
						domain: blockedSignupDomains.domain,
					})
					.from(blockedSignupDomains)
					.where(
						and(
							inArray(blockedSignupDomains.domain, domainNames),
							eq(blockedSignupDomains.isActive, true),
						),
					)
			: [];

	let awsTenantStatus: AwsTenantStatus | undefined;
	let awsDomainStatuses:
		| Array<{
				domain: string;
				aws: AwsDomainStatus;
		  }>
		| undefined;

	if (input.withAws) {
		const sesClient = createSesClient(input.awsRegion);
		awsTenantStatus = await fetchAwsTenantStatus(
			sesClient,
			tenant.tenantName,
			tenant.configurationSetName,
		);
		awsDomainStatuses = await Promise.all(
			tenant.domains.map(async (domainRow) => ({
				domain: domainRow.domain,
				aws: await fetchAwsDomainStatus(sesClient, domainRow.domain),
			})),
		);
	}

	const totalGuard = toNumber(guardAggregate?.totalCount);
	const guardBlockedCount = toNumber(guardAggregate?.guardBlockedCount);
	const guardBlockedRate =
		totalGuard > 0 ? round2((guardBlockedCount / totalGuard) * 100) : 0;

	return {
		command: "tenant",
		generatedAt: new Date().toISOString(),
		timeRange: input.timeRange,
		tenant: {
			...tenant,
			rateLimitOverride: rateOverride
				? {
						hourlyLimit: rateOverride.hourlyLimit,
						isActive: rateOverride.isActive,
						reason: rateOverride.reason,
						expiresAt: toIso(rateOverride.expiresAt),
						updatedAt: toIso(rateOverride.updatedAt),
					}
				: null,
			guard: {
				totalStructuredEmails: totalGuard,
				guardBlockedCount,
				guardBlockedRate,
				lastGuardBlockedAt: toIso(guardAggregate?.lastGuardBlockedAt),
			},
			recentSentEmails: recentSentEmails.map((row) => ({
				id: row.id,
				fromAddress: row.fromAddress,
				fromDomain: row.fromDomain,
				status: row.status,
				subject: row.subject,
				createdAt: toIso(row.createdAt),
			})),
			recentDeliveryEvents: recentDeliveryEvents.map((row) => ({
				id: row.id,
				eventType: row.eventType,
				failedRecipient: row.failedRecipient,
				failedRecipientDomain: row.failedRecipientDomain,
				statusCode: row.statusCode,
				createdAt: toIso(row.createdAt),
			})),
			blockedSignupDomains: blockedDomainRows.map((row) => row.domain),
			awsTenantStatus,
			awsDomainStatuses,
		},
	};
}

async function runAccountCommand(input: AccountCliInput): Promise<AccountResult> {
	const { db, user, tables } = await loadDbDeps();
	const { blockedSignupDomains, emailDeliveryEvents, emailDomains, rateLimitOverrides, sentEmails, structuredEmails } =
		tables;
	const rangeStart = getRangeStart(input.timeRange);

	const userWhere = input.userId
		? eq(user.id, input.userId)
		: ilike(user.email, input.email || "");

	const [accountRow] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			banned: user.banned,
			banReason: user.banReason,
			banExpires: user.banExpires,
		})
		.from(user)
		.where(userWhere)
		.limit(1);

	if (!accountRow) {
		throw new Error("Account not found");
	}

	const [tenantInsight] = await listTenantInsights({
		timeRange: input.timeRange,
		userIds: [accountRow.id],
	});

	const domains = await db
		.select({
			id: emailDomains.id,
			domain: emailDomains.domain,
			status: emailDomains.status,
			canReceiveEmails: emailDomains.canReceiveEmails,
		})
		.from(emailDomains)
		.where(eq(emailDomains.userId, accountRow.id))
		.orderBy(asc(emailDomains.domain));

	const [sentAggregate] = await db
		.select({
			sentCount: count(),
			failedCount: sql<number>`sum(case when ${sentEmails.status} = 'failed' then 1 else 0 end)`,
			lastSentAt: sql<Date | null>`max(${sentEmails.createdAt})`,
		})
		.from(sentEmails)
		.where(
			and(eq(sentEmails.userId, accountRow.id), gte(sentEmails.createdAt, rangeStart)),
		);

	const [deliveryAggregate] = await db
		.select({
			bounces: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'bounce' then 1 else 0 end)`,
			complaints: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'complaint' then 1 else 0 end)`,
			deliveryFailures: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'delivery_failure' then 1 else 0 end)`,
			uniqueFailedRecipients: sql<number>`count(distinct ${emailDeliveryEvents.failedRecipient})`,
			lastDeliveryEventAt: sql<Date | null>`max(${emailDeliveryEvents.createdAt})`,
		})
		.from(emailDeliveryEvents)
		.where(
			and(
				eq(emailDeliveryEvents.userId, accountRow.id),
				gte(emailDeliveryEvents.createdAt, rangeStart),
			),
		);

	const rejectedCountSql = sql<number>`count(*)`;
	const rejectedDomainRows = await db
		.select({
			domain: emailDeliveryEvents.failedRecipientDomain,
			eventCount: rejectedCountSql,
		})
		.from(emailDeliveryEvents)
		.where(
			and(
				eq(emailDeliveryEvents.userId, accountRow.id),
				gte(emailDeliveryEvents.createdAt, rangeStart),
				sql`${emailDeliveryEvents.failedRecipientDomain} is not null and ${emailDeliveryEvents.failedRecipientDomain} <> ''`,
			),
		)
		.groupBy(emailDeliveryEvents.failedRecipientDomain)
		.orderBy(desc(rejectedCountSql))
		.limit(3);

	const [guardAggregate] = await db
		.select({
			totalCount: count(),
			guardBlockedCount: sql<number>`sum(case when ${structuredEmails.guardBlocked} = true then 1 else 0 end)`,
			lastGuardBlockedAt: sql<Date | null>`max(case when ${structuredEmails.guardBlocked} = true then ${structuredEmails.createdAt} else null end)`,
		})
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.userId, accountRow.id),
				gte(structuredEmails.createdAt, rangeStart),
			),
		);

	const [rateOverride] = await db
		.select({
			hourlyLimit: rateLimitOverrides.hourlyLimit,
			isActive: rateLimitOverrides.isActive,
			reason: rateLimitOverrides.reason,
			expiresAt: rateLimitOverrides.expiresAt,
			updatedAt: rateLimitOverrides.updatedAt,
		})
		.from(rateLimitOverrides)
		.where(eq(rateLimitOverrides.userId, accountRow.id))
		.limit(1);

	const recentSentEmails = await db
		.select({
			id: sentEmails.id,
			fromAddress: sentEmails.fromAddress,
			fromDomain: sentEmails.fromDomain,
			status: sentEmails.status,
			subject: sentEmails.subject,
			createdAt: sentEmails.createdAt,
		})
		.from(sentEmails)
		.where(
			and(eq(sentEmails.userId, accountRow.id), gte(sentEmails.createdAt, rangeStart)),
		)
		.orderBy(desc(sentEmails.createdAt))
		.limit(20);

	const recentDeliveryEvents = await db
		.select({
			id: emailDeliveryEvents.id,
			eventType: emailDeliveryEvents.eventType,
			failedRecipient: emailDeliveryEvents.failedRecipient,
			failedRecipientDomain: emailDeliveryEvents.failedRecipientDomain,
			statusCode: emailDeliveryEvents.statusCode,
			createdAt: emailDeliveryEvents.createdAt,
		})
		.from(emailDeliveryEvents)
		.where(
			and(
				eq(emailDeliveryEvents.userId, accountRow.id),
				gte(emailDeliveryEvents.createdAt, rangeStart),
			),
		)
		.orderBy(desc(emailDeliveryEvents.createdAt))
		.limit(20);

	const domainNames = domains.map((domainRow) => domainRow.domain);
	const blockedDomainRows =
		domainNames.length > 0
			? await db
					.select({
						domain: blockedSignupDomains.domain,
					})
					.from(blockedSignupDomains)
					.where(
						and(
							inArray(blockedSignupDomains.domain, domainNames),
							eq(blockedSignupDomains.isActive, true),
						),
					)
			: [];

	const sentCount = toNumber(sentAggregate?.sentCount);
	const failedSends = toNumber(sentAggregate?.failedCount);
	const bounces = toNumber(deliveryAggregate?.bounces);
	const complaints = toNumber(deliveryAggregate?.complaints);
	const deliveryFailures = toNumber(deliveryAggregate?.deliveryFailures);
	const uniqueFailedRecipients = toNumber(deliveryAggregate?.uniqueFailedRecipients);
	const bounceRate = sentCount > 0 ? round2((bounces / sentCount) * 100) : 0;
	const complaintRate = sentCount > 0 ? round2((complaints / sentCount) * 100) : 0;
	const topRejectedRecipientDomains = rejectedDomainRows.map((row) => ({
		domain: row.domain || "unknown",
		count: toNumber(row.eventCount),
	}));

	const risk = buildRiskProfile({
		bounceRate,
		complaintRate,
		bounces,
		complaints,
		deliveryFailures,
		failedSends,
		uniqueFailedRecipients,
		topRejectedDomainCount: topRejectedRecipientDomains[0]?.count || 0,
		userBanned: accountRow.banned === true,
		tenantStatus: tenantInsight?.status || "active",
	});

	const totalGuard = toNumber(guardAggregate?.totalCount);
	const guardBlockedCount = toNumber(guardAggregate?.guardBlockedCount);
	const guardBlockedRate =
		totalGuard > 0 ? round2((guardBlockedCount / totalGuard) * 100) : 0;

	let awsTenantStatus: AwsTenantStatus | undefined;
	let awsDomainStatuses:
		| Array<{
				domain: string;
				aws: AwsDomainStatus;
		  }>
		| undefined;

	if (input.withAws) {
		const sesClient = createSesClient(input.awsRegion);
		if (tenantInsight) {
			awsTenantStatus = await fetchAwsTenantStatus(
				sesClient,
				tenantInsight.tenantName,
				tenantInsight.configurationSetName,
			);
		}

		awsDomainStatuses = await Promise.all(
			domains.map(async (domainRow) => ({
				domain: domainRow.domain,
				aws: await fetchAwsDomainStatus(sesClient, domainRow.domain),
			})),
		);
	}

	return {
		command: "account",
		generatedAt: new Date().toISOString(),
		timeRange: input.timeRange,
		account: {
			id: accountRow.id,
			name: accountRow.name,
			email: accountRow.email,
			banned: accountRow.banned,
			banReason: accountRow.banReason,
			banExpires: toIso(accountRow.banExpires),
			tenant: tenantInsight || null,
			domains: domains.map((domainRow) => ({
				id: domainRow.id,
				domain: domainRow.domain,
				status: domainRow.status,
				canReceiveEmails: domainRow.canReceiveEmails,
			})),
			risk,
			stats: {
				sent: sentCount,
				failedSends,
				bounces,
				complaints,
				deliveryFailures,
				bounceRate,
				complaintRate,
				lastSentAt: toIso(sentAggregate?.lastSentAt),
				lastDeliveryEventAt: toIso(deliveryAggregate?.lastDeliveryEventAt),
				topRejectedRecipientDomains,
			},
			guard: {
				totalStructuredEmails: totalGuard,
				guardBlockedCount,
				guardBlockedRate,
				lastGuardBlockedAt: toIso(guardAggregate?.lastGuardBlockedAt),
			},
			rateLimitOverride: rateOverride
				? {
						hourlyLimit: rateOverride.hourlyLimit,
						isActive: rateOverride.isActive,
						reason: rateOverride.reason,
						expiresAt: toIso(rateOverride.expiresAt),
						updatedAt: toIso(rateOverride.updatedAt),
					}
				: null,
			blockedSignupDomains: blockedDomainRows.map((row) => row.domain),
			recentSentEmails: recentSentEmails.map((row) => ({
				id: row.id,
				fromAddress: row.fromAddress,
				fromDomain: row.fromDomain,
				status: row.status,
				subject: row.subject,
				createdAt: toIso(row.createdAt),
			})),
			recentDeliveryEvents: recentDeliveryEvents.map((row) => ({
				id: row.id,
				eventType: row.eventType,
				failedRecipient: row.failedRecipient,
				failedRecipientDomain: row.failedRecipientDomain,
				statusCode: row.statusCode,
				createdAt: toIso(row.createdAt),
			})),
			awsTenantStatus,
			awsDomainStatuses,
		},
	};
}

async function runDomainCommand(input: DomainCliInput): Promise<DomainResult> {
	const { db, user, tables } = await loadDbDeps();
	const { blockedSignupDomains, emailDeliveryEvents, emailDomains, sentEmails, sesTenants, structuredEmails } =
		tables;
	const rangeStart = getRangeStart(input.timeRange);
	const normalizedDomain = input.domain?.toLowerCase();

	const domainWhere = input.domainId
		? eq(emailDomains.id, input.domainId)
		: eq(emailDomains.domain, normalizedDomain || "");

	const [domainRow] = await db
		.select({
			id: emailDomains.id,
			domain: emailDomains.domain,
			status: emailDomains.status,
			canReceiveEmails: emailDomains.canReceiveEmails,
			tenantId: emailDomains.tenantId,
			userId: emailDomains.userId,
			userEmail: user.email,
			userBanned: user.banned,
			tenantName: sesTenants.tenantName,
			tenantStatus: sesTenants.status,
			tenantConfigurationSetName: sesTenants.configurationSetName,
		})
		.from(emailDomains)
		.leftJoin(user, eq(emailDomains.userId, user.id))
		.leftJoin(sesTenants, eq(emailDomains.tenantId, sesTenants.id))
		.where(domainWhere)
		.limit(1);

	if (!domainRow) {
		throw new Error("Domain not found");
	}

	const [blockedSignup] = await db
		.select({
			reason: blockedSignupDomains.reason,
			blockedBy: blockedSignupDomains.blockedBy,
			updatedAt: blockedSignupDomains.updatedAt,
		})
		.from(blockedSignupDomains)
		.where(
			and(
				eq(blockedSignupDomains.domain, domainRow.domain),
				eq(blockedSignupDomains.isActive, true),
			),
		)
		.limit(1);

	const [sentAggregate] = await db
		.select({
			sentCount: count(),
			failedCount: sql<number>`sum(case when ${sentEmails.status} = 'failed' then 1 else 0 end)`,
			lastSentAt: sql<Date | null>`max(${sentEmails.createdAt})`,
		})
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.fromDomain, domainRow.domain),
				gte(sentEmails.createdAt, rangeStart),
			),
		);

	const [deliveryAggregate] = await db
		.select({
			bounces: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'bounce' then 1 else 0 end)`,
			complaints: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'complaint' then 1 else 0 end)`,
			deliveryFailures: sql<number>`sum(case when ${emailDeliveryEvents.eventType} = 'delivery_failure' then 1 else 0 end)`,
			uniqueFailedRecipients: sql<number>`count(distinct ${emailDeliveryEvents.failedRecipient})`,
			lastDeliveryEventAt: sql<Date | null>`max(${emailDeliveryEvents.createdAt})`,
		})
		.from(emailDeliveryEvents)
		.where(
			and(
				eq(emailDeliveryEvents.domainName, domainRow.domain),
				gte(emailDeliveryEvents.createdAt, rangeStart),
			),
		);

	const [guardAggregate] = await db
		.select({
			receivedCount: count(),
			guardBlockedCount: sql<number>`sum(case when ${structuredEmails.guardBlocked} = true then 1 else 0 end)`,
			lastGuardBlockedAt: sql<Date | null>`max(case when ${structuredEmails.guardBlocked} = true then ${structuredEmails.createdAt} else null end)`,
		})
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.userId, domainRow.userId),
				gte(structuredEmails.createdAt, rangeStart),
				sql`lower(${structuredEmails.recipient}) like ${`%@${domainRow.domain.toLowerCase()}`}`,
			),
		);

	const recentDeliveryEvents = await db
		.select({
			id: emailDeliveryEvents.id,
			eventType: emailDeliveryEvents.eventType,
			failedRecipient: emailDeliveryEvents.failedRecipient,
			failedRecipientDomain: emailDeliveryEvents.failedRecipientDomain,
			statusCode: emailDeliveryEvents.statusCode,
			createdAt: emailDeliveryEvents.createdAt,
		})
		.from(emailDeliveryEvents)
		.where(
			and(
				eq(emailDeliveryEvents.domainName, domainRow.domain),
				gte(emailDeliveryEvents.createdAt, rangeStart),
			),
		)
		.orderBy(desc(emailDeliveryEvents.createdAt))
		.limit(20);

	const sentCount = toNumber(sentAggregate?.sentCount);
	const failedSends = toNumber(sentAggregate?.failedCount);
	const bounces = toNumber(deliveryAggregate?.bounces);
	const complaints = toNumber(deliveryAggregate?.complaints);
	const deliveryFailures = toNumber(deliveryAggregate?.deliveryFailures);
	const uniqueFailedRecipients = toNumber(deliveryAggregate?.uniqueFailedRecipients);
	const bounceRate = sentCount > 0 ? round2((bounces / sentCount) * 100) : 0;
	const complaintRate = sentCount > 0 ? round2((complaints / sentCount) * 100) : 0;

	const risk = buildRiskProfile({
		bounceRate,
		complaintRate,
		bounces,
		complaints,
		deliveryFailures,
		failedSends,
		uniqueFailedRecipients,
		topRejectedDomainCount: uniqueFailedRecipients,
		userBanned: domainRow.userBanned === true,
		tenantStatus: domainRow.tenantStatus || "active",
	});

	const receivedCount = toNumber(guardAggregate?.receivedCount);
	const guardBlockedCount = toNumber(guardAggregate?.guardBlockedCount);
	const guardBlockedRate =
		receivedCount > 0 ? round2((guardBlockedCount / receivedCount) * 100) : 0;

	let awsDomainStatus: AwsDomainStatus | undefined;
	let awsTenantStatus: AwsTenantStatus | undefined;

	if (input.withAws) {
		const sesClient = createSesClient(input.awsRegion);
		awsDomainStatus = await fetchAwsDomainStatus(sesClient, domainRow.domain);
		if (domainRow.tenantName) {
			awsTenantStatus = await fetchAwsTenantStatus(
				sesClient,
				domainRow.tenantName,
				domainRow.tenantConfigurationSetName,
			);
		}
	}

	return {
		command: "domain",
		generatedAt: new Date().toISOString(),
		timeRange: input.timeRange,
		domain: {
			id: domainRow.id,
			domain: domainRow.domain,
			status: domainRow.status,
			canReceiveEmails: domainRow.canReceiveEmails,
			tenantId: domainRow.tenantId,
			userId: domainRow.userId,
			userEmail: domainRow.userEmail,
			userBanned: domainRow.userBanned,
			tenantName: domainRow.tenantName,
			tenantStatus: domainRow.tenantStatus,
			blockedSignup: blockedSignup
				? {
						isActive: true,
						reason: blockedSignup.reason,
						blockedBy: blockedSignup.blockedBy,
						updatedAt: toIso(blockedSignup.updatedAt),
					}
				: null,
			stats: {
				sent: sentCount,
				failedSends,
				bounces,
				complaints,
				deliveryFailures,
				bounceRate,
				complaintRate,
				lastSentAt: toIso(sentAggregate?.lastSentAt),
				lastDeliveryEventAt: toIso(deliveryAggregate?.lastDeliveryEventAt),
			},
			guard: {
				receivedCount,
				guardBlockedCount,
				guardBlockedRate,
				lastGuardBlockedAt: toIso(guardAggregate?.lastGuardBlockedAt),
			},
			recentDeliveryEvents: recentDeliveryEvents.map((row) => ({
				id: row.id,
				eventType: row.eventType,
				failedRecipient: row.failedRecipient,
				failedRecipientDomain: row.failedRecipientDomain,
				statusCode: row.statusCode,
				createdAt: toIso(row.createdAt),
			})),
			awsDomainStatus,
			awsTenantStatus,
			risk,
		},
	};
}

async function runSuppressionCommand(
	input: SuppressionCliInput,
): Promise<SuppressionResult> {
	const { db, tables } = await loadDbDeps();
	const { blockedEmails, blockedSignupDomains, emailDeliveryEvents } = tables;

	const sesClient = createSesClient(input.awsRegion);
	let awsSuppressed = false;
	let awsReason: string | null = null;
	let awsLastUpdateTime: string | null = null;
	let awsAttributes: Record<string, string> | null = null;
	let awsError: string | null = null;

	try {
		const suppression = await sesClient.send(
			new GetSuppressedDestinationCommand({
				EmailAddress: input.email,
			}),
		);
		awsSuppressed = true;
		awsReason = suppression.SuppressedDestination?.Reason || null;
		awsLastUpdateTime = toIso(suppression.SuppressedDestination?.LastUpdateTime);
		awsAttributes =
			(suppression.SuppressedDestination?.Attributes as Record<string, string> | undefined) ||
			null;
	} catch (error) {
		if (isAwsNotFoundError(error)) {
			awsSuppressed = false;
		} else {
			awsError = `${getErrorName(error)} ${getErrorMessage(error)}`;
		}
	}

	const deliveryEvents = await db
		.select({
			id: emailDeliveryEvents.id,
			eventType: emailDeliveryEvents.eventType,
			statusCode: emailDeliveryEvents.statusCode,
			diagnosticCode: emailDeliveryEvents.diagnosticCode,
			createdAt: emailDeliveryEvents.createdAt,
		})
		.from(emailDeliveryEvents)
		.where(eq(emailDeliveryEvents.failedRecipient, input.email))
		.orderBy(desc(emailDeliveryEvents.createdAt))
		.limit(50);

	const [blockedEmail] = await db
		.select({
			reason: blockedEmails.reason,
			blockedBy: blockedEmails.blockedBy,
			updatedAt: blockedEmails.updatedAt,
		})
		.from(blockedEmails)
		.where(eq(blockedEmails.emailAddress, input.email))
		.limit(1);

	const emailDomain = input.email.includes("@")
		? input.email.split("@")[1] || null
		: null;

	const [blockedSignupDomain] = emailDomain
		? await db
				.select({
					reason: blockedSignupDomains.reason,
					blockedBy: blockedSignupDomains.blockedBy,
					updatedAt: blockedSignupDomains.updatedAt,
				})
				.from(blockedSignupDomains)
				.where(
					and(
						eq(blockedSignupDomains.domain, emailDomain),
						eq(blockedSignupDomains.isActive, true),
					),
				)
				.limit(1)
		: [];

	const bounces = deliveryEvents.filter((row) => row.eventType === "bounce").length;
	const complaints = deliveryEvents.filter(
		(row) => row.eventType === "complaint",
	).length;
	const deliveryFailures = deliveryEvents.filter(
		(row) => row.eventType === "delivery_failure",
	).length;
	const latest = deliveryEvents[0];

	return {
		command: "suppression",
		generatedAt: new Date().toISOString(),
		email: input.email,
		domain: emailDomain,
		awsRegion: input.awsRegion,
		awsSuppression: {
			suppressed: awsSuppressed,
			reason: awsReason,
			lastUpdateTime: awsLastUpdateTime,
			attributes: awsAttributes,
			error: awsError,
		},
		localSignals: {
			totalEvents: deliveryEvents.length,
			bounces,
			complaints,
			deliveryFailures,
			lastEventAt: toIso(latest?.createdAt),
			lastStatusCode: latest?.statusCode || null,
			lastDiagnosticCode: latest?.diagnosticCode || null,
			blockedEmail: blockedEmail
				? {
						reason: blockedEmail.reason,
						blockedBy: blockedEmail.blockedBy,
						updatedAt: toIso(blockedEmail.updatedAt),
					}
				: null,
			blockedSignupDomain: blockedSignupDomain
				? {
						reason: blockedSignupDomain.reason,
						blockedBy: blockedSignupDomain.blockedBy,
						updatedAt: toIso(blockedSignupDomain.updatedAt),
					}
				: null,
		},
	};
}

function printOverview(result: OverviewResult): void {
	console.log("Investigation overview");
	console.log(`generated_at=${result.generatedAt}`);
	console.log(`time_range=${result.timeRange}`);
	console.log(`scanned_tenants=${result.summary.scannedTenants}`);
	console.log(`returned_tenants=${result.summary.returnedTenants}`);
	console.log(`flagged_tenants=${result.summary.flaggedTenants}`);
	console.log(`total_sent=${result.summary.totalSent}`);
	console.log(`bounce_rate_overall=${result.summary.bounceRateOverall}%`);
	console.log(`complaint_rate_overall=${result.summary.complaintRateOverall}%`);

	console.log("\n[TENANTS]");
	if (result.tenants.length === 0) {
		console.log("none");
		return;
	}

	for (const tenant of result.tenants) {
		console.log(
			[
				`tenant_id=${tenant.id}`,
				`tenant_name=${tenant.tenantName}`,
				`status=${tenant.status}`,
				`risk_score=${tenant.risk.score}`,
				`suspicious=${tenant.risk.suspicious}`,
				`sent=${tenant.stats.sent}`,
				`bounce_rate=${tenant.stats.bounceRate}%`,
				`complaint_rate=${tenant.stats.complaintRate}%`,
				`flags=${tenant.risk.flags.join(",") || "none"}`,
				`user_email=${tenant.user.email || "null"}`,
			].join(" "),
		);
	}
}

function printTenant(result: TenantResult): void {
	const tenant = result.tenant;
	console.log("Tenant investigation");
	console.log(`tenant_id=${tenant.id}`);
	console.log(`tenant_name=${tenant.tenantName}`);
	console.log(`tenant_status=${tenant.status}`);
	console.log(`user_id=${tenant.user.id}`);
	console.log(`user_email=${tenant.user.email || "null"}`);
	console.log(`risk_score=${tenant.risk.score}`);
	console.log(`risk_flags=${tenant.risk.flags.join(",") || "none"}`);
	console.log(`sent=${tenant.stats.sent}`);
	console.log(`bounce_rate=${tenant.stats.bounceRate}%`);
	console.log(`complaint_rate=${tenant.stats.complaintRate}%`);
	console.log(`guard_blocked_rate=${tenant.guard.guardBlockedRate}%`);
	console.log(`blocked_signup_domains=${tenant.blockedSignupDomains.join(",") || "none"}`);
}

function printAccount(result: AccountResult): void {
	const account = result.account;
	console.log("Account investigation");
	console.log(`user_id=${account.id}`);
	console.log(`email=${account.email}`);
	console.log(`banned=${account.banned ?? "null"}`);
	console.log(`tenant_id=${account.tenant?.id || "none"}`);
	console.log(`risk_score=${account.risk.score}`);
	console.log(`risk_flags=${account.risk.flags.join(",") || "none"}`);
	console.log(`sent=${account.stats.sent}`);
	console.log(`bounce_rate=${account.stats.bounceRate}%`);
	console.log(`complaint_rate=${account.stats.complaintRate}%`);
	console.log(`guard_blocked_rate=${account.guard.guardBlockedRate}%`);
	console.log(`blocked_signup_domains=${account.blockedSignupDomains.join(",") || "none"}`);
}

function printDomain(result: DomainResult): void {
	const domain = result.domain;
	console.log("Domain investigation");
	console.log(`domain_id=${domain.id}`);
	console.log(`domain=${domain.domain}`);
	console.log(`status=${domain.status}`);
	console.log(`tenant_id=${domain.tenantId || "null"}`);
	console.log(`tenant_name=${domain.tenantName || "null"}`);
	console.log(`user_id=${domain.userId}`);
	console.log(`user_email=${domain.userEmail || "null"}`);
	console.log(`risk_score=${domain.risk.score}`);
	console.log(`risk_flags=${domain.risk.flags.join(",") || "none"}`);
	console.log(`sent=${domain.stats.sent}`);
	console.log(`bounce_rate=${domain.stats.bounceRate}%`);
	console.log(`complaint_rate=${domain.stats.complaintRate}%`);
	console.log(`guard_blocked_rate=${domain.guard.guardBlockedRate}%`);
	console.log(`blocked_signup=${domain.blockedSignup ? "true" : "false"}`);
}

function printSuppression(result: SuppressionResult): void {
	console.log("Suppression investigation");
	console.log(`email=${result.email}`);
	console.log(`domain=${result.domain || "null"}`);
	console.log(`aws_region=${result.awsRegion}`);
	console.log(`aws_suppressed=${result.awsSuppression.suppressed}`);
	console.log(`aws_reason=${result.awsSuppression.reason || "null"}`);
	console.log(`aws_last_update=${result.awsSuppression.lastUpdateTime || "null"}`);
	console.log(`local_event_count=${result.localSignals.totalEvents}`);
	console.log(`local_bounces=${result.localSignals.bounces}`);
	console.log(`local_complaints=${result.localSignals.complaints}`);
	console.log(`local_delivery_failures=${result.localSignals.deliveryFailures}`);
	console.log(`blocked_email=${result.localSignals.blockedEmail ? "true" : "false"}`);
	console.log(
		`blocked_signup_domain=${result.localSignals.blockedSignupDomain ? "true" : "false"}`,
	);
}

function printHuman(result: InvestigationResult): void {
	if (result.command === "overview") {
		printOverview(result);
		return;
	}
	if (result.command === "tenant") {
		printTenant(result);
		return;
	}
	if (result.command === "account") {
		printAccount(result);
		return;
	}
	if (result.command === "domain") {
		printDomain(result);
		return;
	}
	printSuppression(result);
}

async function runCommand(input: CliInput): Promise<void> {
	if (input.command === "help") {
		printUsage();
		return;
	}

	let result: InvestigationResult;
	if (input.command === "overview") {
		result = await runOverviewCommand(input);
	} else if (input.command === "tenant") {
		result = await runTenantCommand(input);
	} else if (input.command === "account") {
		result = await runAccountCommand(input);
	} else if (input.command === "domain") {
		result = await runDomainCommand(input);
	} else {
		result = await runSuppressionCommand(input);
	}

	if (input.asJson) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	printHuman(result);
}

export async function main(args: string[]): Promise<void> {
	const parsed = parseCliInput(args);
	await runCommand(parsed);
}

function isDirectExecution(): boolean {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}

	return entry.includes("investigate-abuse.ts");
}

if (isDirectExecution()) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(`investigate-abuse failed: ${getErrorMessage(error)}`);
		printUsage();
		process.exit(1);
	});
}
