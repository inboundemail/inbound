import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { emailDomains } from "@/lib/db/schema";
import { enableEasyDkim, saveDkimRecords } from "@/lib/domains-and-dns/dkim";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import { validateAndRateLimit } from "../lib/auth";

const EnableDkimResponse = t.Object({
	domain: t.String(),
	dkimStatus: t.String({
		description:
			"SES DKIM status: PENDING until the CNAME records are found, then SUCCESS",
	}),
	dnsRecords: t.Array(
		t.Object({
			type: t.String(),
			name: t.String(),
			value: t.String(),
			isRequired: t.Boolean(),
			description: t.String(),
		}),
	),
});

const ErrorResponse = t.Object({ error: t.String() });

export const enableDomainDkim = new Elysia().post(
	"/domains/:id/dkim",
	async ({ request, params, set }) => {
		const userId = await validateAndRateLimit(request, set);

		const [domain] = await db
			.select()
			.from(emailDomains)
			.where(
				and(eq(emailDomains.id, params.id), eq(emailDomains.userId, userId)),
			)
			.limit(1);
		if (!domain) {
			set.status = 404;
			return { error: "Domain not found" };
		}

		// Subdomains of a verified parent send with the parent's identity and DKIM.
		const rootDomain = isSubdomain(domain.domain)
			? getRootDomain(domain.domain)
			: null;
		if (rootDomain) {
			const [parent] = await db
				.select({ id: emailDomains.id })
				.from(emailDomains)
				.where(
					and(
						eq(emailDomains.domain, rootDomain),
						eq(emailDomains.userId, userId),
						eq(emailDomains.status, "verified"),
					),
				)
				.limit(1);
			if (parent) {
				set.status = 409;
				return {
					error: `DKIM for ${domain.domain} is managed on its parent domain ${rootDomain}`,
				};
			}
		}

		if (!domain.verificationToken) {
			set.status = 409;
			return { error: "Domain verification has not been started" };
		}

		try {
			const dkim = await enableEasyDkim(domain.domain);
			await saveDkimRecords(domain.id, dkim.records);
			return {
				domain: domain.domain,
				dkimStatus: dkim.status,
				dnsRecords: dkim.records,
			};
		} catch (error) {
			console.error(`Failed to enable DKIM for ${domain.domain}:`, error);
			set.status = 502;
			return { error: "Could not enable DKIM with the email provider" };
		}
	},
	{
		params: t.Object({ id: t.String() }),
		response: {
			200: EnableDkimResponse,
			404: ErrorResponse,
			409: ErrorResponse,
			502: ErrorResponse,
		},
		detail: {
			tags: ["Domains"],
			summary: "Enable DKIM",
			description:
				"Start DKIM signing for a domain and return the three CNAME records to add to its DNS. Until they are published, mail is still sent and signed by Amazon SES. Safe to call again: it returns the existing records, or restarts setup after a failure.",
		},
	},
);
