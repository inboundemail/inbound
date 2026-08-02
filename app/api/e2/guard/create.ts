import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { guardRules } from "@/lib/db/schema";
import { validateAndRateLimit } from "../lib/auth";

const GuardTextCriterionOpenApiSchema = {
	type: "object",
	required: ["operator", "values"],
	properties: {
		operator: {
			type: "string",
			enum: ["OR", "AND"],
			description:
				"OR matches any value; AND requires every value to match.",
		},
		values: {
			type: "array",
			minItems: 1,
			items: { type: "string" },
			description: "Case-insensitive substrings to match.",
		},
	},
} as const;

const GuardAddressCriterionOpenApiSchema = {
	type: "object",
	required: ["operator", "values"],
	properties: {
		operator: {
			type: "string",
			enum: ["OR", "AND"],
			description:
				"OR matches any address; AND requires every pattern to match.",
		},
		values: {
			type: "array",
			minItems: 1,
			items: { type: "string" },
			description:
				"Exact email addresses or whole-domain patterns such as *@example.com.",
		},
	},
} as const;

const ExplicitRuleConfigOpenApiSchema = {
	title: "Explicit rule configuration",
	type: "object",
	properties: {
		prompt: false,
		mode: {
			type: "string",
			enum: ["simple", "advanced"],
		},
		subject: GuardTextCriterionOpenApiSchema,
		from: GuardAddressCriterionOpenApiSchema,
		to: GuardAddressCriterionOpenApiSchema,
		hasAttachment: {
			type: "boolean",
			description: "Match emails based on whether they contain attachments.",
		},
		hasWords: GuardTextCriterionOpenApiSchema,
	},
} as const;

const AiPromptRuleConfigOpenApiSchema = {
	title: "AI prompt rule configuration",
	type: "object",
	required: ["prompt"],
	properties: {
		mode: {
			type: "string",
			enum: ["simple", "advanced"],
		},
		prompt: {
			type: "string",
			minLength: 1,
			description: "Natural-language description of when the rule should match.",
		},
	},
} as const;

const GuardActionOpenApiSchemas = [
	{
		title: "Allow",
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

const CreateGuardRuleBody = t.Object(
	{
		name: t.String({
			minLength: 1,
			description: "A descriptive name for the rule.",
		}),
		description: t.Optional(
			t.String({
				description: "Optional explanation of what the rule handles.",
			}),
		),
		type: t.Union([t.Literal("explicit"), t.Literal("ai_prompt")], {
			description:
				"Use explicit for deterministic criteria or ai_prompt for natural-language matching.",
		}),
		config: t.Any({
			description:
				"Configuration matching the selected rule type. See the request examples for complete explicit and AI configurations.",
			oneOf: [
				ExplicitRuleConfigOpenApiSchema,
				AiPromptRuleConfigOpenApiSchema,
			],
		}),
		priority: t.Optional(
			t.Number({
				description:
					"Evaluation priority. Higher values run first; the first matching rule wins. Defaults to 0.",
				default: 0,
			}),
		),
		action: t.Optional(
			t.Any({
				description:
					"Action to take when the rule matches: allow, block, or route to an owned endpoint. Defaults to allow when omitted.",
				oneOf: GuardActionOpenApiSchemas,
			}),
		),
	},
	{
		examples: [
			{
				name: "Block suspicious support invoices",
				description: "Block invoice emails with attachments sent to support.",
				type: "explicit",
				priority: 100,
				config: {
					to: { operator: "OR", values: ["support@example.com"] },
					subject: {
						operator: "OR",
						values: ["invoice", "payment overdue"],
					},
					hasAttachment: true,
				},
				action: { action: "block" },
			},
			{
				name: "Route partner purchase orders",
				type: "explicit",
				priority: 50,
				config: {
					from: { operator: "OR", values: ["*@partner.example"] },
					hasWords: {
						operator: "AND",
						values: ["purchase order", "account number"],
					},
				},
				action: { action: "route", endpointId: "endpoint_123" },
			},
			{
				name: "Block credential phishing",
				type: "ai_prompt",
				config: {
					mode: "simple",
					prompt:
						"Match messages attempting to steal passwords, MFA codes, or login credentials.",
				},
				action: { action: "block" },
			},
		],
	},
);

// Guard rule schema for response
const GuardRuleSchema = t.Object({
	id: t.String(),
	userId: t.String(),
	name: t.String(),
	description: t.Nullable(t.String()),
	type: t.String(),
	config: t.String(),
	isActive: t.Nullable(t.Boolean()),
	priority: t.Nullable(t.Number()),
	lastTriggeredAt: t.Nullable(t.String()),
	triggerCount: t.Nullable(t.Number()),
	actions: t.Nullable(t.String()),
	createdAt: t.Nullable(t.String()),
	updatedAt: t.Nullable(t.String()),
});

// Response schema - matches the envelope format expected by hooks
const CreateGuardRuleResponse = t.Object(
	{
		success: t.Literal(true),
		data: GuardRuleSchema,
	},
	{
		description: "The newly created active guard rule.",
		examples: [
			{
				success: true,
				data: {
					id: "V1StGXR8_Z5jdHi6B-myT",
					userId: "user_123",
					name: "Block suspicious support invoices",
					description: "Block invoice emails with attachments sent to support.",
					type: "explicit",
					config:
						'{"to":{"operator":"OR","values":["support@example.com"]},"subject":{"operator":"OR","values":["invoice","payment overdue"]},"hasAttachment":true}',
					isActive: true,
					priority: 100,
					lastTriggeredAt: null,
					triggerCount: 0,
					actions: '{"action":"block"}',
					createdAt: "2026-06-12T17:00:00.000Z",
					updatedAt: "2026-06-12T17:00:00.000Z",
				},
			},
		],
	},
);

const ErrorResponse = t.Object({
	error: t.String(),
});

export const createGuardRule = new Elysia().post(
	"/guard",
	async ({ request, body, set }) => {
		console.log("📝 POST /api/e2/guard - Creating guard rule");

		// Auth & rate limit validation
		const userId = await validateAndRateLimit(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		const { name, description, type, config, priority, action } = body;

		// Validate name
		if (!name?.trim()) {
			set.status = 400;
			return { error: "Rule name is required" };
		}

		// Serialize config to JSON string
		const configJson =
			typeof config === "string" ? config : JSON.stringify(config);
		const actionsJson = action
			? typeof action === "string"
				? action
				: JSON.stringify(action)
			: null;

		try {
			const ruleId = nanoid();
			const now = new Date();

			const [newRule] = await db
				.insert(guardRules)
				.values({
					id: ruleId,
					userId,
					name: name.trim(),
					description: description?.trim() || null,
					type,
					config: configJson,
					isActive: true,
					priority: priority ?? 0,
					triggerCount: 0,
					actions: actionsJson,
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			console.log("✅ Guard rule created:", ruleId);

			set.status = 201;
			return {
				success: true as const,
				data: {
					id: newRule.id,
					userId: newRule.userId,
					name: newRule.name,
					description: newRule.description,
					type: newRule.type,
					config: newRule.config,
					isActive: newRule.isActive,
					priority: newRule.priority,
					lastTriggeredAt: newRule.lastTriggeredAt?.toISOString() || null,
					triggerCount: newRule.triggerCount,
					actions: newRule.actions,
					createdAt: newRule.createdAt?.toISOString() || null,
					updatedAt: newRule.updatedAt?.toISOString() || null,
				},
			};
		} catch (error) {
			console.error("❌ Failed to create guard rule:", error);
			set.status = 500;
			return {
				error:
					error instanceof Error
						? error.message
						: "Failed to create guard rule",
			};
		}
	},
	{
		body: CreateGuardRuleBody,
		response: {
			201: CreateGuardRuleResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Guard"],
			summary: "Create guard rule",
			description: `Create an active email filtering rule for the authenticated account.

For an \`explicit\` rule, configure one or more of \`subject\`, \`from\`, \`to\`, \`hasAttachment\`, and \`hasWords\`. Different configured criteria are combined with AND. Within a criterion, \`OR\` matches any value and \`AND\` requires every value.

Address criteria support exact, case-insensitive addresses and whole-domain patterns such as \`*@example.com\`. The \`to\` criterion matches the actual delivered recipient, which makes it suitable for limiting a rule to one inbox. Subject and body criteria use case-insensitive substring matching.

Rules are evaluated from highest priority to lowest, and the first matching rule wins. A matching rule can \`allow\`, \`block\`, or \`route\` the email to an active endpoint owned by the account. If action is omitted, it defaults to \`allow\`.

For an \`ai_prompt\` rule, provide a non-empty natural-language \`prompt\` describing when the rule should match.`,
		},
	},
);
