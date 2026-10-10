import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { resumeTenantSending } from "@/lib/aws-ses/aws-ses-tenants";
import { db } from "@/lib/db";
import { rateLimitOverrides, sesTenants } from "@/lib/db/schema";
import { validateAdminAndRateLimit } from "../lib/auth";

const ResumeTenantBody = t.Optional(
	t.Object({
		reason: t.Optional(t.String({ maxLength: 1000 })),
		force: t.Optional(t.Boolean()),
		hourlyLimit: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
		expiresAt: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
	}),
);

const ResumeTenantResponse = t.Object({
	success: t.Boolean(),
	message: t.String(),
	tenant: t.Object({
		id: t.String(),
		userId: t.String(),
		tenantName: t.String(),
		configurationSetName: t.Nullable(t.String()),
		status: t.String(),
	}),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const resumeTenant = new Elysia().post(
	"/admin/tenants/:tenantId/resume",
	async ({ request, params, body, set }) => {
		const adminUserId = await validateAdminAndRateLimit(request, set);
		if (!adminUserId) {
			set.status = 403;
			return { error: "Admin access required" };
		}

		const tenantResult = await db
			.select()
			.from(sesTenants)
			.where(eq(sesTenants.id, params.tenantId))
			.limit(1);

		const tenant = tenantResult[0];
		if (!tenant) {
			set.status = 404;
			return { error: "Tenant not found" };
		}

		if (tenant.status === "suspended" && body?.force !== true) {
			set.status = 409;
			return {
				error:
					"Tenant is suspended. Pass force: true to resume a suspended tenant",
			};
		}

		const hasOverride = body?.hourlyLimit !== undefined;
		let expiresAt: Date | null = null;
		if (body?.expiresAt) {
			if (!hasOverride) {
				set.status = 400;
				return { error: "expiresAt requires hourlyLimit" };
			}

			expiresAt = new Date(body.expiresAt);
			if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
				set.status = 400;
				return { error: "expiresAt must be a future date" };
			}
		}

		if (hasOverride) {
			const overrideValues = {
				hourlyLimit: body?.hourlyLimit ?? null,
				isActive: true,
				reason: body?.reason || `Set on resume by admin user ${adminUserId}`,
				createdBy: adminUserId,
				expiresAt,
				updatedAt: new Date(),
			};

			await db
				.insert(rateLimitOverrides)
				.values({
					id: `rlo_${nanoid()}`,
					userId: tenant.userId,
					...overrideValues,
				})
				.onConflictDoUpdate({
					target: rateLimitOverrides.userId,
					set: overrideValues,
				});
		}

		if (tenant.status === "active") {
			return {
				success: true,
				message: `Tenant ${tenant.tenantName} is already active`,
				tenant: {
					id: tenant.id,
					userId: tenant.userId,
					tenantName: tenant.tenantName,
					configurationSetName: tenant.configurationSetName,
					status: tenant.status,
				},
			};
		}

		if (tenant.configurationSetName) {
			const resumeResult = await resumeTenantSending(
				tenant.configurationSetName,
			);

			if (!resumeResult.success) {
				set.status = 500;
				return { error: resumeResult.error || "Failed to resume tenant" };
			}
		} else {
			await db
				.update(sesTenants)
				.set({
					status: "active",
					updatedAt: new Date(),
				})
				.where(eq(sesTenants.id, tenant.id));
		}

		const updatedTenantResult = await db
			.select()
			.from(sesTenants)
			.where(eq(sesTenants.id, tenant.id))
			.limit(1);

		const updatedTenant = updatedTenantResult[0] || {
			...tenant,
			status: "active",
		};

		return {
			success: true,
			message: `Tenant ${updatedTenant.tenantName} resumed successfully`,
			tenant: {
				id: updatedTenant.id,
				userId: updatedTenant.userId,
				tenantName: updatedTenant.tenantName,
				configurationSetName: updatedTenant.configurationSetName,
				status: updatedTenant.status,
			},
		};
	},
	{
		params: t.Object({
			tenantId: t.String(),
		}),
		body: ResumeTenantBody,
		response: {
			200: ResumeTenantResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
			404: ErrorResponse,
			409: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			hide: true,
			tags: ["Admin"],
			summary: "Resume tenant sending",
			description:
				"Resume sending for a paused tenant by re-enabling the AWS SES configuration set and marking the tenant as active. Suspended tenants require force: true. Optionally upserts the user's hourly rate limit override (hourlyLimit null = unlimited, with optional expiresAt) so the send guard does not immediately re-pause the tenant.",
		},
	},
);
