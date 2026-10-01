/**
 * Entry plan (Autumn `inbound_default_test`) checkout rules.
 *
 * - Customers who paid for the plan before (e.g. their subscription was
 *   canceled after failed payments) come back on version 2, the $4 price
 *   they had, instead of the current $9 version.
 * - Checkout always goes through a Stripe checkout page (redirect_mode
 *   "always"). Charging the saved payment method directly caused a loop for
 *   lapsed customers: the card failed, the subscription expired as
 *   incomplete, and the paywall came straight back.
 */

export const ENTRY_PLAN_ID = "inbound_default_test";
/** Last $4 version of the entry plan; v3 (Oct 2026) is $9. */
const GRANDFATHERED_VERSION = 2;

const AUTUMN_API = "https://api.useautumn.com/v1";
const AUTUMN_API_VERSION = "2.4.0";

function autumnHeaders() {
	const key = process.env.AUTUMN_SECRET_KEY;
	if (!key) throw new Error("AUTUMN_SECRET_KEY is not set");
	return {
		Authorization: `Bearer ${key}`,
		"Content-Type": "application/json",
		"x-api-version": AUTUMN_API_VERSION,
	};
}

type AutumnInvoice = { status?: string; product_ids?: string[] };

/** True when the customer has a paid invoice for the entry plan. */
async function paidForEntryPlanBefore(customerId: string): Promise<boolean> {
	const response = await fetch(
		`${AUTUMN_API}/customers/${encodeURIComponent(customerId)}?expand=invoices`,
		{ headers: autumnHeaders(), cache: "no-store" },
	);
	if (!response.ok) return false;
	const customer = (await response.json()) as { invoices?: AutumnInvoice[] };
	return (customer.invoices ?? []).some(
		(invoice) => invoice.status === "paid" && invoice.product_ids?.includes(ENTRY_PLAN_ID),
	);
}

export type EntryPlanOffer = {
	/** Plan version to attach; null means the current version. */
	version: number | null;
	/** Monthly price this customer would pay, from Autumn's preview. */
	price: number | null;
	/** They paid before and no longer have the plan (usually failed payments). */
	returning: boolean;
};

export async function getEntryPlanOffer(customerId: string): Promise<EntryPlanOffer> {
	try {
		const returning = await paidForEntryPlanBefore(customerId);
		const version = returning ? GRANDFATHERED_VERSION : null;
		const preview = await fetch(`${AUTUMN_API}/billing.preview_attach`, {
			method: "POST",
			headers: autumnHeaders(),
			body: JSON.stringify({
				customer_id: customerId,
				plan_id: ENTRY_PLAN_ID,
				...(version ? { version } : {}),
			}),
			cache: "no-store",
		});
		const data = preview.ok ? ((await preview.json()) as { total?: number }) : null;
		return { version, price: typeof data?.total === "number" ? data.total : null, returning };
	} catch (error) {
		console.error("entry plan offer failed", error);
		return { version: null, price: null, returning: false };
	}
}

/** Creates a Stripe checkout for the entry plan and returns its URL. */
export async function createEntryPlanCheckout(params: {
	customerId: string;
	successUrl: string;
}): Promise<string> {
	const offer = await getEntryPlanOffer(params.customerId);
	const response = await fetch(`${AUTUMN_API}/billing.attach`, {
		method: "POST",
		headers: autumnHeaders(),
		body: JSON.stringify({
			customer_id: params.customerId,
			plan_id: ENTRY_PLAN_ID,
			...(offer.version ? { version: offer.version } : {}),
			redirect_mode: "always",
			success_url: params.successUrl,
		}),
		cache: "no-store",
	});
	const data = (await response.json().catch(() => null)) as {
		payment_url?: string;
		message?: string;
	} | null;
	if (!response.ok || !data?.payment_url) {
		throw new Error(data?.message ?? `Checkout failed (${response.status})`);
	}
	return data.payment_url;
}
