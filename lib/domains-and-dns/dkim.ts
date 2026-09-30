import {
	GetEmailIdentityCommand,
	PutEmailIdentityDkimSigningAttributesCommand,
	SESv2Client,
} from "@aws-sdk/client-sesv2";
import { and, eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { domainDnsRecords } from "@/lib/db/schema";

/**
 * SES Easy DKIM: SES signs mail from the domain with its own 2048-bit key once
 * the three CNAME records below are published. Until then SES keeps signing as
 * amazonses.com, and domain verification (TXT) is unaffected.
 */

export interface DkimDnsRecord {
	type: "CNAME";
	name: string;
	value: string;
	isRequired: false;
	description: string;
}

export interface DkimSetup {
	/** SES DKIM status: PENDING, SUCCESS, FAILED, TEMPORARY_FAILURE or NOT_STARTED */
	status: string;
	records: DkimDnsRecord[];
}

let client: SESv2Client | null = null;
function sesClient(): SESv2Client {
	const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
	if (!accessKeyId || !secretAccessKey) {
		throw new Error("AWS credentials are not configured");
	}
	client ??= new SESv2Client({
		region: process.env.AWS_REGION || "us-east-2",
		credentials: { accessKeyId, secretAccessKey },
	});
	return client;
}

/**
 * Starts Easy DKIM for a domain identity that already exists in SES, or restarts
 * it after a failure, and returns the CNAME records to publish. Idempotent: an
 * identity that is already pending or verified keeps its tokens. Identities
 * using their own keys (BYODKIM) are left alone.
 */
export async function enableEasyDkim(domain: string): Promise<DkimSetup> {
	const ses = sesClient();
	const getAttributes = async () =>
		(await ses.send(new GetEmailIdentityCommand({ EmailIdentity: domain })))
			.DkimAttributes;

	let attributes = await getAttributes();
	if (attributes?.SigningAttributesOrigin === "EXTERNAL") {
		return { status: attributes.Status ?? "NOT_STARTED", records: [] };
	}
	if (
		!attributes?.Tokens?.length ||
		attributes.Status === "NOT_STARTED" ||
		attributes.Status === "FAILED"
	) {
		await ses.send(
			new PutEmailIdentityDkimSigningAttributesCommand({
				EmailIdentity: domain,
				SigningAttributesOrigin: "AWS_SES",
				SigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
			}),
		);
		attributes = await getAttributes();
	}

	// SES docs: always build the CNAME target from the identity's hosted zone.
	const zone = attributes?.SigningHostedZone || "dkim.amazonses.com";
	return {
		status: attributes?.Status ?? "PENDING",
		records: (attributes?.Tokens ?? []).map((token) => ({
			type: "CNAME",
			name: `${token}._domainkey.${domain}`,
			value: `${token}.${zone}`,
			isRequired: false,
			description: "DKIM signing (recommended)",
		})),
	};
}

/**
 * Stores the domain's DKIM CNAMEs as optional DNS records, replacing any from a
 * previous (e.g. failed) setup. Rows whose name and value are unchanged keep
 * their verification state.
 */
export async function saveDkimRecords(
	domainId: string,
	records: DkimDnsRecord[],
): Promise<void> {
	if (records.length === 0) return;
	const existing = await db
		.select()
		.from(domainDnsRecords)
		.where(
			and(
				eq(domainDnsRecords.domainId, domainId),
				eq(domainDnsRecords.recordType, "CNAME"),
				like(domainDnsRecords.name, "%._domainkey.%"),
			),
		);

	const key = (r: { name: string; value: string }) =>
		`${r.name.toLowerCase()} ${r.value.toLowerCase()}`;
	const wanted = new Set(records.map(key));
	const have = new Set(existing.map(key));

	for (const row of existing) {
		if (!wanted.has(key(row))) {
			await db.delete(domainDnsRecords).where(eq(domainDnsRecords.id, row.id));
		}
	}
	const missing = records.filter((r) => !have.has(key(r)));
	if (missing.length > 0) {
		await db.insert(domainDnsRecords).values(
			missing.map((r) => ({
				id: `dns_${nanoid()}`,
				domainId,
				recordType: r.type,
				name: r.name,
				value: r.value,
				isRequired: false,
				isVerified: false,
				description: r.description,
			})),
		);
	}
}
