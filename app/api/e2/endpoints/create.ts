import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { emailGroups, endpoints } from "@/lib/db/schema";
import { generateNewWebhookVerificationToken } from "@/lib/webhooks/verification";
import { validateAndRateLimit } from "../lib/auth";
import { validateEndpointConfig } from "./validation";

// Request/Response Types (OpenAPI-compatible)
const WebhookConfigSchema = t.Object(
	{
		url: t.String(),
		timeout: t.Optional(t.Number({ minimum: 1, maximum: 300 })),
		retryAttempts: t.Optional(t.Number({ minimum: 0, maximum: 10 })),
		headers: t.Optional(
			t.Record(t.String(), t.String(), {
				description: "Custom headers to include with webhook requests",
			}),
		),
	},
	{ title: "WebhookConfig" },
);

const EmailConfigSchema = t.Object(
	{
		forwardTo: t.String({ format: "email" }),
		includeAttachments: t.Optional(t.Boolean()),
		subjectPrefix: t.Optional(t.String({ maxLength: 255 })),
		fromAddress: t.Optional(t.String({ format: "email" })),
		senderName: t.Optional(t.String({ maxLength: 255 })),
		preserveHeaders: t.Optional(t.Boolean()),
	},
	{ title: "EmailConfig" },
);

const EmailGroupConfigSchema = t.Object(
	{
		emails: t.Array(t.String({ format: "email" }), {
			minItems: 1,
			maxItems: 50,
		}),
		includeAttachments: t.Optional(t.Boolean()),
		subjectPrefix: t.Optional(t.String({ maxLength: 255 })),
		fromAddress: t.Optional(t.String({ format: "email" })),
		senderName: t.Optional(t.String({ maxLength: 255 })),
		preserveHeaders: t.Optional(t.Boolean()),
	},
	{ title: "EmailGroupConfig" },
);

const CreateEndpointBody = t.Object({
	name: t.String({ minLength: 1, maxLength: 255 }),
	type: t.Union([
		t.Literal("webhook"),
		t.Literal("email"),
		t.Literal("email_group"),
	]),
	config: t.Union([
		WebhookConfigSchema,
		EmailConfigSchema,
		EmailGroupConfigSchema,
	]),
	description: t.Optional(t.String({ maxLength: 1000 })),
});

const DeliveryStatsSchema = t.Object({
	total: t.Number(),
	successful: t.Number(),
	failed: t.Number(),
	lastDelivery: t.Nullable(t.String()),
});

const EndpointResponse = t.Object({
	id: t.String(),
	name: t.String(),
	type: t.Union([
		t.Literal("webhook"),
		t.Literal("email"),
		t.Literal("email_group"),
	]),
	config: t.Unknown(),
	isActive: t.Boolean(),
	description: t.Nullable(t.String()),
	userId: t.String(),
	createdAt: t.String(),
	updatedAt: t.String(),
	groupEmails: t.Nullable(t.Array(t.String())),
	deliveryStats: DeliveryStatsSchema,
});

const ErrorResponse = t.Object({
	error: t.String(),
	message: t.String(),
	statusCode: t.Number(),
});

const ValidationErrorResponse = t.Object({
	error: t.String(),
	details: t.Optional(t.String()),
});

export const createEndpoint = new Elysia().post(
	"/endpoints",
	async ({ request, body, set }) => {
		console.log("➕ POST /api/e2/endpoints - Starting create request");

		// Auth & rate limit validation - throws on error
		const userId = await validateAndRateLimit(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		console.log("📝 Received endpoint data:", {
			name: body.name,
			type: body.type,
			hasConfig: !!body.config,
			description: body.description,
		});

		// Validate config based on type
		console.log("🔍 Validating endpoint configuration");
		const validationResult = validateEndpointConfig(body.type, body.config);
		if (!validationResult.valid) {
			console.log("❌ Invalid configuration:", validationResult.error);
			set.status = 400;
			return {
				error: "Invalid configuration",
				details: validationResult.error,
			};
		}

		// For webhook endpoints, generate a verificationToken at creation time
		// so it's immediately available via the API
		const configToStore = { ...body.config };
		if (body.type === "webhook") {
			(configToStore as Record<string, unknown>).verificationToken =
				generateNewWebhookVerificationToken();
		}

		const newEndpoint = {
			id: nanoid(),
			name: body.name,
			type: body.type,
			config: JSON.stringify(configToStore),
			description: body.description || null,
			userId: userId,
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		console.log("💾 Creating endpoint in database");
		const [createdEndpoint] = await db
			.insert(endpoints)
			.values(newEndpoint)
			.returning();

		// If it's an email group, create the group entries
		let groupEmails: string[] | null = null;
		if (body.type === "email_group" && "emails" in body.config) {
			console.log(
				"📧 Creating email group entries, count:",
				body.config.emails.length,
			);
			groupEmails = body.config.emails as string[];

			const groupEntries = groupEmails.map((email) => ({
				id: nanoid(),
				endpointId: createdEndpoint.id,
				emailAddress: email,
				createdAt: new Date(),
			}));

			if (groupEntries.length > 0) {
				await db.insert(emailGroups).values(groupEntries);
			}
		}

		// Return enhanced response
		const response = {
			id: createdEndpoint.id,
			name: createdEndpoint.name,
			type: createdEndpoint.type as "webhook" | "email" | "email_group",
			config: JSON.parse(createdEndpoint.config),
			isActive: createdEndpoint.isActive || false,
			description: createdEndpoint.description,
			userId: createdEndpoint.userId,
			createdAt: createdEndpoint.createdAt
				? new Date(createdEndpoint.createdAt).toISOString()
				: new Date().toISOString(),
			updatedAt: createdEndpoint.updatedAt
				? new Date(createdEndpoint.updatedAt).toISOString()
				: new Date().toISOString(),
			groupEmails,
			deliveryStats: {
				total: 0,
				successful: 0,
				failed: 0,
				lastDelivery: null,
			},
		};

		console.log("✅ Successfully created endpoint:", createdEndpoint.id);
		set.status = 201;
		return response;
	},
	{
		body: CreateEndpointBody,
		response: {
			201: EndpointResponse,
			400: ValidationErrorResponse,
			401: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Endpoints"],
			summary: "Create new endpoint",
			description:
				"Create a new endpoint (webhook, email, or email_group) for the authenticated user",
		},
	},
);
