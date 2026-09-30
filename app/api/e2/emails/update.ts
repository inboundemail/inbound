import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { resolveStructuredEmailId } from "@/lib/email-management/email-aliases";
import { structuredEmails } from "@/lib/db/schema";
import { validateAndRateLimit } from "../lib/auth";

// Request schema
const UpdateEmailBody = t.Object({
	is_read: t.Optional(t.Boolean()),
	is_archived: t.Optional(t.Boolean()),
});

// Response schemas
const UpdateEmailSuccessResponse = t.Object({
	object: t.Literal("email"),
	id: t.String(),
	is_read: t.Boolean(),
	is_archived: t.Boolean(),
	updated_at: t.String(),
});

const UpdateEmailErrorResponse = t.Object({
	error: t.String(),
});

export const updateEmail = new Elysia().patch(
	"/emails/:id",
	async ({ request, params, body, set }) => {
		// Auth & rate limit validation
		const userId = await validateAndRateLimit(request, set);

		const emailId = await resolveStructuredEmailId(params.id, userId);

		// Validate that at least one field is being updated
		if (body.is_read === undefined && body.is_archived === undefined) {
			set.status = 400;
			return {
				error: "At least one field must be provided: is_read, is_archived",
			};
		}

		// Build the update payload
		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (body.is_read !== undefined) {
			updateData.isRead = body.is_read;
			updateData.readAt = body.is_read ? new Date() : null;
		}

		if (body.is_archived !== undefined) {
			updateData.isArchived = body.is_archived;
			updateData.archivedAt = body.is_archived ? new Date() : null;
		}

		// Update the email
		const updated = await db
			.update(structuredEmails)
			.set(updateData)
			.where(
				and(
					eq(structuredEmails.id, emailId),
					eq(structuredEmails.userId, userId),
				),
			)
			.returning({
				id: structuredEmails.id,
				isRead: structuredEmails.isRead,
				isArchived: structuredEmails.isArchived,
				updatedAt: structuredEmails.updatedAt,
			});

		if (updated.length === 0) {
			set.status = 404;
			return { error: "Email not found" };
		}

		const email = updated[0];

		return {
			object: "email" as const,
			id: email.id,
			is_read: email.isRead ?? false,
			is_archived: email.isArchived ?? false,
			updated_at: email.updatedAt?.toISOString() || new Date().toISOString(),
		};
	},
	{
		params: t.Object({
			id: t.String(),
		}),
		body: UpdateEmailBody,
		response: {
			200: UpdateEmailSuccessResponse,
			400: UpdateEmailErrorResponse,
			401: UpdateEmailErrorResponse,
			404: UpdateEmailErrorResponse,
			500: UpdateEmailErrorResponse,
		},
		detail: {
			tags: ["Emails"],
			summary: "Update email",
			description:
				"Update metadata for a received email. Supports marking emails as read/unread and archived/unarchived.",
		},
	},
);
