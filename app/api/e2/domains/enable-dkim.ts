import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import { db } from "@/lib/db";
import { getVerifiedParentDomain } from "@/lib/db/domains";
import { domainDnsRecords, emailDomains } from "@/lib/db/schema";
import { enableEasyDkim } from "@/lib/domains-and-dns/domain-verification";

const DkimDnsRecordSchema = t.Object({
	type: t.Literal("CNAME"),
	name: t.String(),
	value: t.String(),
	description: t.String(),
	isRequired: t.Boolean(),
});

const EnableDkimResponse = t.Object({
	domainId: t.String(),
	domain: t.String(),
	dkimStatus: t.String(),
	dnsRecords: t.Array(DkimDnsRecordSchema),
});

const EnableDkimErrorResponse = t.Object({
	error: t.String(),
});

export const enableDomainDkim = new Elysia().post(
	"/domains/:id/dkim",
	async ({ request, params, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const domainResult = await db
			.select({
				id: emailDomains.id,
				domain: emailDomains.domain,
			})
			.from(emailDomains)
			.where(
				and(eq(emailDomains.id, params.id), eq(emailDomains.userId, userId)),
			)
			.limit(1);

		const domain = domainResult[0];
		if (!domain) {
			set.status = 404;
			return { error: "Domain not found" };
		}

		const parentDomain = await getVerifiedParentDomain(domain.domain, userId);
		if (parentDomain) {
			set.status = 409;
			return {
				error: `DKIM is inherited from the verified parent domain ${parentDomain.domain}`,
			};
		}

		try {
			const result = await enableEasyDkim(domain.domain);

			for (const record of result.dnsRecords) {
				const existingRecord = await db
					.select({
						id: domainDnsRecords.id,
						value: domainDnsRecords.value,
					})
					.from(domainDnsRecords)
					.where(
						and(
							eq(domainDnsRecords.domainId, domain.id),
							eq(domainDnsRecords.recordType, record.type),
							eq(domainDnsRecords.name, record.name),
						),
					)
					.limit(1);

				if (existingRecord[0]) {
					await db
						.update(domainDnsRecords)
						.set({
							value: record.value,
							description: record.description,
							isRequired: true,
							isVerified:
								existingRecord[0].value === record.value ? undefined : false,
						})
						.where(eq(domainDnsRecords.id, existingRecord[0].id));
				} else {
					await db.insert(domainDnsRecords).values({
						id: `dns_${crypto.randomUUID()}`,
						domainId: domain.id,
						recordType: record.type,
						name: record.name,
						value: record.value,
						description: record.description,
						isRequired: true,
						isVerified: false,
					});
				}
			}

			return {
				domainId: domain.id,
				domain: domain.domain,
				dkimStatus: result.status,
				dnsRecords: result.dnsRecords.map((record) => ({
					...record,
					isRequired: true,
				})),
			};
		} catch (error) {
			console.error(`Failed to enable Easy DKIM for ${domain.domain}:`, error);
			set.status = 500;
			return { error: "Failed to enable Easy DKIM" };
		}
	},
	{
		params: t.Object({
			id: t.String(),
		}),
		response: {
			200: EnableDkimResponse,
			401: EnableDkimErrorResponse,
			404: EnableDkimErrorResponse,
			409: EnableDkimErrorResponse,
			500: EnableDkimErrorResponse,
		},
		detail: {
			tags: ["Domains"],
			summary: "Enable Easy DKIM",
			description:
				"Enable SES Easy DKIM for an existing domain and return the required DNS CNAME records.",
		},
	},
);
