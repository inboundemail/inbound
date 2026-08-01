/**
 * Campaign link tooling for email outreach.
 *
 * Usage (DATABASE_URL must point at the target database):
 *   bun run scripts/campaign-links.ts mint <recipients.json> --campaign <name>
 *   bun run scripts/campaign-links.ts stats [--campaign <name>]
 *   bun run scripts/campaign-links.ts export [--campaign <name>]
 *
 * mint expects a JSON file shaped like:
 *   { "variant_a_custom": [{ id, email, domain, ... }], "variant_b_generic": [...] }
 * It inserts one campaign_links row per recipient (skipping tokens that already
 * exist for the same campaign + customer) and writes <recipients.json>.minted.json
 * with the token and full redirect URLs merged into each recipient.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { campaignLinks } from "@/lib/db/schema";

const BASE_URL = "https://inbound.new";

type Recipient = {
	id: string;
	email: string;
	name?: string | null;
	domain?: string;
	subject_domain?: string;
};

function arg(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	return i > -1 ? process.argv[i + 1] : undefined;
}

async function mint(path: string, campaign: string) {
	const input = JSON.parse(readFileSync(path, "utf8")) as {
		variant_a_custom: Recipient[];
		variant_b_generic: Recipient[];
	};

	const existing = await db
		.select({
			customerId: campaignLinks.customerId,
			token: campaignLinks.token,
		})
		.from(campaignLinks)
		.where(eq(campaignLinks.campaign, campaign));
	const existingByCustomer = new Map(
		existing.map((r) => [r.customerId, r.token]),
	);

	const minted: Record<string, (Recipient & { token: string })[]> = {
		variant_a_custom: [],
		variant_b_generic: [],
	};
	const rows: (typeof campaignLinks.$inferInsert)[] = [];

	for (const [variantKey, variantName] of [
		["variant_a_custom", "custom-domain"],
		["variant_b_generic", "generic"],
	] as const) {
		for (const r of input[variantKey]) {
			let token = existingByCustomer.get(r.id);
			if (!token) {
				token = nanoid(14);
				rows.push({
					token,
					campaign,
					customerId: r.id,
					email: r.email,
					variant: variantName,
				});
			}
			minted[variantKey].push({
				...r,
				token,
				home_url: `${BASE_URL}/r/${token}?to=home`,
				checkout_url: `${BASE_URL}/r/${token}?to=checkout`,
			} as Recipient & { token: string });
		}
	}

	for (let i = 0; i < rows.length; i += 500) {
		await db.insert(campaignLinks).values(rows.slice(i, i + 500));
	}

	const outPath = path.replace(/\.json$/, "") + ".minted.json";
	writeFileSync(outPath, JSON.stringify(minted, null, 1));
	console.log(
		`campaign "${campaign}": inserted ${rows.length} new links (${existingByCustomer.size} already existed)`,
	);
	console.log(`wrote ${outPath}`);
}

async function stats(campaign?: string) {
	const links = campaign
		? await db
				.select()
				.from(campaignLinks)
				.where(eq(campaignLinks.campaign, campaign))
		: await db.select().from(campaignLinks);

	const byVariant = new Map<
		string,
		{
			total: number;
			sent: number;
			clicked: number;
			home: number;
			checkout: number;
		}
	>();
	for (const l of links) {
		const v = byVariant.get(l.variant) ?? {
			total: 0,
			sent: 0,
			clicked: 0,
			home: 0,
			checkout: 0,
		};
		v.total++;
		if (l.sentAt) v.sent++;
		if (l.firstClickedAt) v.clicked++;
		v.home += l.homeClicks;
		v.checkout += l.checkoutClicks;
		byVariant.set(l.variant, v);
	}

	console.log(`campaign: ${campaign ?? "(all)"} — ${links.length} links`);
	for (const [variant, v] of byVariant) {
		const ctr = v.sent > 0 ? ((v.clicked / v.sent) * 100).toFixed(1) : "n/a";
		console.log(
			`  ${variant}: ${v.total} minted, ${v.sent} sent, ${v.clicked} clicked (${ctr}% of sent), ${v.home} home clicks, ${v.checkout} checkout clicks`,
		);
	}
	const clickers = links
		.filter((l) => l.firstClickedAt)
		.sort(
			(a, b) =>
				(b.lastClickedAt?.getTime() ?? 0) - (a.lastClickedAt?.getTime() ?? 0),
		);
	if (clickers.length > 0) {
		console.log("\nclickers:");
		for (const l of clickers) {
			console.log(
				`  ${l.email} [${l.variant}] home=${l.homeClicks} checkout=${l.checkoutClicks} last=${l.lastClickedAt?.toISOString()}`,
			);
		}
	}
}

async function exportCsv(campaign?: string) {
	const links = campaign
		? await db
				.select()
				.from(campaignLinks)
				.where(eq(campaignLinks.campaign, campaign))
		: await db.select().from(campaignLinks);
	console.log(
		"token,campaign,customer_id,email,variant,sent_at,home_clicks,checkout_clicks,first_clicked_at,last_clicked_at",
	);
	for (const l of links) {
		console.log(
			[
				l.token,
				l.campaign,
				l.customerId,
				l.email,
				l.variant,
				l.sentAt?.toISOString() ?? "",
				l.homeClicks,
				l.checkoutClicks,
				l.firstClickedAt?.toISOString() ?? "",
				l.lastClickedAt?.toISOString() ?? "",
			].join(","),
		);
	}
}

const [, , command, maybePath] = process.argv;
const campaign = arg("--campaign");

if (command === "mint") {
	if (!maybePath || !campaign) {
		console.error(
			"usage: bun run scripts/campaign-links.ts mint <recipients.json> --campaign <name>",
		);
		process.exit(1);
	}
	await mint(maybePath, campaign);
} else if (command === "stats") {
	await stats(campaign);
} else if (command === "export") {
	await exportCsv(campaign);
} else {
	console.error("usage: campaign-links.ts mint|stats|export");
	process.exit(1);
}
process.exit(0);
