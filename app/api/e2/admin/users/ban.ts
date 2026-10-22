import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { disableMailCredentialsForUser } from "@/lib/db/mail-credentials";
import { user } from "@/lib/db/schema";
import { validateAdminAndRateLimit } from "../lib/auth";

const BanUserBody = t.Optional(
	t.Object({
		reason: t.Optional(t.String({ maxLength: 1000 })),
		banExpires: t.Optional(
			t.String({
				format: "date-time",
			}),
		),
	}),
);

const BanUserResponse = t.Object({
	success: t.Boolean(),
	message: t.String(),
	user: t.Object({
		id: t.String(),
		email: t.Nullable(t.String()),
		name: t.Nullable(t.String()),
		banned: t.Nullable(t.Boolean()),
		banReason: t.Nullable(t.String()),
		banExpires: t.Nullable(t.String()),
		updatedAt: t.Nullable(t.String()),
	}),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const banUser = new Elysia().post(
	"/admin/users/:userId/ban",
	async ({ request, params, body, set }) => {
		const adminUserId = await validateAdminAndRateLimit(request, set);
		if (!adminUserId) {
			set.status = 403;
			return { error: "Admin access required" };
		}

		let parsedBanExpires: Date | null = null;
		if (body?.banExpires) {
			parsedBanExpires = new Date(body.banExpires);
			if (Number.isNaN(parsedBanExpires.getTime())) {
				set.status = 400;
				return { error: "Invalid banExpires timestamp" };
			}
		}

		const existingResult = await db
			.select()
			.from(user)
			.where(eq(user.id, params.userId))
			.limit(1);

		const existingUser = existingResult[0];
		if (!existingUser) {
			set.status = 404;
			return { error: "User not found" };
		}

		const appliedReason =
			body?.reason?.trim() || `Banned by admin user ${adminUserId}`;

		await db
			.update(user)
			.set({
				banned: true,
				banReason: appliedReason,
				banExpires: parsedBanExpires,
				updatedAt: new Date(),
			})
			.where(eq(user.id, params.userId));
		const permanentBan = parsedBanExpires === null;
		const disabledCredentials = permanentBan
			? await disableMailCredentialsForUser(params.userId)
			: 0;

		const updatedResult = await db
			.select()
			.from(user)
			.where(eq(user.id, params.userId))
			.limit(1);

		const updatedUser = updatedResult[0] || {
			...existingUser,
			banned: true,
			banReason: appliedReason,
			banExpires: parsedBanExpires,
			updatedAt: new Date(),
		};

		return {
			success: true,
			message: permanentBan
				? `User ${updatedUser.id} banned successfully; ${disabledCredentials} mail credential(s) disabled`
				: `User ${updatedUser.id} banned until ${parsedBanExpires?.toISOString()}; mail credentials stay enabled but are refused until the ban expires`,
			user: {
				id: updatedUser.id,
				email: updatedUser.email,
				name: updatedUser.name,
				banned: updatedUser.banned,
				banReason: updatedUser.banReason,
				banExpires: updatedUser.banExpires
					? updatedUser.banExpires.toISOString()
					: null,
				updatedAt: updatedUser.updatedAt
					? updatedUser.updatedAt.toISOString()
					: null,
			},
		};
	},
	{
		params: t.Object({
			userId: t.String(),
		}),
		body: BanUserBody,
		response: {
			200: BanUserResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
			404: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			hide: true,
			tags: ["Admin"],
			summary: "Ban user",
			description:
				"Ban a user account and prevent authentication/sending until unbanned. Permanent bans (no banExpires) also disable the user's mail credentials; temporary bans leave them enabled but refused until the ban expires.",
		},
	},
);
