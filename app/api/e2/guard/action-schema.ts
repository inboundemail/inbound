import { t } from "elysia";

export const GUARD_RULE_ACTIONS = [
	"allow",
	"block",
	"junk",
	"route",
	"flag",
	"label",
] as const;

export type GuardRuleAction =
	| { action: "allow" | "block" | "junk" | "flag" | "label" }
	| { action: "route"; endpointId: string };

const GuardActionOpenApiSchemas = [
	{
		title: "Allow",
		description: "Deliver the email and mark it as not junk.",
		type: "object",
		required: ["action"],
		properties: { action: { const: "allow" } },
	},
	{
		title: "Block",
		type: "object",
		required: ["action"],
		properties: { action: { const: "block" } },
	},
	{
		title: "Junk",
		description:
			"Mark the email as junk. It is still delivered to endpoints, and shown in the Junk folder of mailboxes.",
		type: "object",
		required: ["action"],
		properties: { action: { const: "junk" } },
	},
	{
		title: "Route",
		type: "object",
		required: ["action", "endpointId"],
		properties: {
			action: { const: "route" },
			endpointId: {
				type: "string",
				description: "ID of an active endpoint owned by the account.",
			},
		},
	},
] as const;

export const GuardRuleActionSchema = t.Any({
	description:
		"Action to take when the rule matches: allow (also marks the email as not junk), block, junk, or route to an owned endpoint. Defaults to allow when omitted.",
	oneOf: GuardActionOpenApiSchemas,
});

/**
 * Normalises a rule action from the API. Accepts the documented objects plus
 * legacy shapes (flag and label actions, a JSON-encoded string, a bare action
 * name, extra keys). Returns null when the value is not a valid action.
 */
export function normalizeGuardAction(value: unknown): GuardRuleAction | null {
	let candidate = value;
	if (typeof candidate === "string") {
		const trimmed = candidate.trim();
		try {
			candidate = JSON.parse(trimmed);
		} catch {
			candidate = { action: trimmed };
		}
	}
	if (typeof candidate === "string") candidate = { action: candidate };
	if (typeof candidate !== "object" || candidate === null) return null;
	const { action, endpointId } = candidate as {
		action?: unknown;
		endpointId?: unknown;
	};
	if (
		typeof action !== "string" ||
		!(GUARD_RULE_ACTIONS as readonly string[]).includes(action)
	) {
		return null;
	}
	if (action === "route") {
		return typeof endpointId === "string" && endpointId.trim()
			? { action: "route", endpointId: endpointId.trim() }
			: null;
	}
	return { action: action as Exclude<GuardRuleAction["action"], "route"> };
}

export const INVALID_GUARD_ACTION =
	"Invalid action: use allow, block, junk, or route with an endpointId";
