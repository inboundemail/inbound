import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { guardRules } from "@/lib/db/schema";
import {
	GuardRuleActionSchema,
	INVALID_GUARD_ACTION,
	normalizeGuardAction,
} from "@/app/api/e2/guard/action-schema";
import { validateAndRateLimit } from "../lib/auth";

// Request schema
const UpdateGuardRuleBody = t.Object({
	name: t.Optional(t.String({ minLength: 1, description: "Rule name" })),
	description: t.Optional(t.String({ description: "Rule description" })),
	config: t.Optional(t.Any({ description: "Rule configuration (JSON)" })),
	isActive: t.Optional(
		t.Boolean({ description: "Whether the rule is active" }),
	),
	priority: t.Optional(t.Number({ description: "Rule priority" })),
	action: t.Optional(GuardRuleActionSchema),
});

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

const ErrorResponse = t.Object({
	error: t.String(),
});

export const updateGuardRule = new Elysia().put(
	"/guard/:id",
	async ({ request, params, body, set }) => {
		console.log("✏️ PUT /api/e2/guard/:id - Updating rule:", params.id);

		// Auth & rate limit validation
		const userId = await validateAndRateLimit(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		// Check if rule exists and belongs to user
		const [existingRule] = await db
			.select()
			.from(guardRules)
			.where(and(eq(guardRules.id, params.id), eq(guardRules.userId, userId)))
			.limit(1);

		if (!existingRule) {
			console.log("❌ Guard rule not found:", params.id);
			set.status = 404;
			return { error: "Guard rule not found" };
		}

		// Build update object
		const updateData: Partial<typeof guardRules.$inferInsert> = {
			updatedAt: new Date(),
		};

		if (body.name !== undefined) {
			updateData.name = body.name.trim();
		}

		if (body.description !== undefined) {
			updateData.description = body.description?.trim() || null;
		}

		if (body.config !== undefined) {
			updateData.config =
				typeof body.config === "string"
					? body.config
					: JSON.stringify(body.config);
		}

		if (body.isActive !== undefined) {
			updateData.isActive = body.isActive;
		}

		if (body.priority !== undefined) {
			updateData.priority = body.priority;
		}

		if (body.action !== undefined) {
			if (body.action === null) {
				updateData.actions = null;
			} else {
				const normalized = normalizeGuardAction(body.action);
				if (!normalized) {
					set.status = 400;
					return { error: INVALID_GUARD_ACTION };
				}
				updateData.actions = JSON.stringify(normalized);
			}
		}

		try {
			const [updatedRule] = await db
				.update(guardRules)
				.set(updateData)
				.where(eq(guardRules.id, params.id))
				.returning();

			console.log("✅ Guard rule updated:", params.id);

			return {
				id: updatedRule.id,
				userId: updatedRule.userId,
				name: updatedRule.name,
				description: updatedRule.description,
				type: updatedRule.type,
				config: updatedRule.config,
				isActive: updatedRule.isActive,
				priority: updatedRule.priority,
				lastTriggeredAt: updatedRule.lastTriggeredAt?.toISOString() || null,
				triggerCount: updatedRule.triggerCount,
				actions: updatedRule.actions,
				createdAt: updatedRule.createdAt?.toISOString() || null,
				updatedAt: updatedRule.updatedAt?.toISOString() || null,
			};
		} catch (error) {
			console.error("❌ Failed to update guard rule:", error);
			set.status = 500;
			return {
				error:
					error instanceof Error
						? error.message
						: "Failed to update guard rule",
			};
		}
	},
	{
		params: t.Object({
			id: t.String(),
		}),
		body: UpdateGuardRuleBody,
		response: {
			200: GuardRuleSchema,
			400: ErrorResponse,
			401: ErrorResponse,
			404: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Guard"],
			summary: "Update guard rule",
			description: "Update an existing guard rule.",
		},
	},
);
