import * as dotenv from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { suspendTenantSending } from "@/lib/aws-ses/aws-ses-tenants";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import {
	SCHEDULED_EMAIL_STATUS,
	scheduledEmails,
	sesTenants,
} from "@/lib/db/schema";

dotenv.config();

type CliOptions = {
	userId?: string;
	email?: string;
	reason: string;
	banExpires?: Date;
	suspendTenant: boolean;
	cancelScheduled: boolean;
};

function getArgValue(args: string[], flag: string): string | undefined {
	const inline = args.find((arg) => arg.startsWith(`${flag}=`));
	if (inline) {
		return inline.slice(flag.length + 1);
	}

	const index = args.indexOf(flag);
	if (index === -1 || index === args.length - 1) {
		return undefined;
	}

	return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag);
}

function parseArgs(args: string[]): CliOptions {
	const userId = getArgValue(args, "--user-id");
	const email = getArgValue(args, "--email");
	const reason =
		getArgValue(args, "--reason") ||
		"Banned by admin for abusive sending activity";
	const banExpiresRaw = getArgValue(args, "--ban-expires");
	const suspendTenant = !hasFlag(args, "--skip-tenant-suspend");
	const cancelScheduled = !hasFlag(args, "--skip-scheduled-cancel");

	if (!userId && !email) {
		console.error(
			'Usage: bun run scripts/ban-user.ts --user-id <id> [--reason "..."] [--ban-expires <ISO>]',
		);
		console.error(
			'   or: bun run scripts/ban-user.ts --email <email> [--reason "..."] [--ban-expires <ISO>]',
		);
		console.error(
			"   optional flags: --skip-tenant-suspend --skip-scheduled-cancel",
		);
		process.exit(1);
	}

	let banExpires: Date | undefined;
	if (banExpiresRaw) {
		banExpires = new Date(banExpiresRaw);
		if (Number.isNaN(banExpires.getTime())) {
			console.error(`Invalid --ban-expires value: ${banExpiresRaw}`);
			process.exit(1);
		}
	}

	return {
		userId,
		email,
		reason,
		banExpires,
		suspendTenant,
		cancelScheduled,
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));

	const lookup = options.userId
		? await db.select().from(user).where(eq(user.id, options.userId)).limit(1)
		: await db
				.select()
				.from(user)
				.where(eq(user.email, options.email!))
				.limit(1);

	const targetUser = lookup[0];
	if (!targetUser) {
		console.error("User not found");
		process.exit(1);
	}

	const alreadyBanned = targetUser.banned === true;
	const now = new Date();

	const [updatedUser] = await db
		.update(user)
		.set({
			banned: true,
			banReason: options.reason,
			banExpires: options.banExpires || null,
			updatedAt: now,
		})
		.where(eq(user.id, targetUser.id))
		.returning({
			id: user.id,
			name: user.name,
			email: user.email,
			banned: user.banned,
			banReason: user.banReason,
			banExpires: user.banExpires,
			updatedAt: user.updatedAt,
		});

	let cancelledScheduledCount = 0;
	if (options.cancelScheduled) {
		const cancelledScheduled = await db
			.update(scheduledEmails)
			.set({
				status: SCHEDULED_EMAIL_STATUS.CANCELLED,
				lastError: `Cancelled because account was banned: ${options.reason}`,
				updatedAt: now,
			})
			.where(
				and(
					eq(scheduledEmails.userId, targetUser.id),
					inArray(scheduledEmails.status, [
						SCHEDULED_EMAIL_STATUS.SCHEDULED,
						SCHEDULED_EMAIL_STATUS.PROCESSING,
						SCHEDULED_EMAIL_STATUS.PAUSED,
					]),
				),
			)
			.returning({ id: scheduledEmails.id });

		cancelledScheduledCount = cancelledScheduled.length;
	}

	const [tenant] = await db
		.select({
			id: sesTenants.id,
			tenantName: sesTenants.tenantName,
			status: sesTenants.status,
			configurationSetName: sesTenants.configurationSetName,
		})
		.from(sesTenants)
		.where(eq(sesTenants.userId, targetUser.id))
		.limit(1);

	let tenantSummary = "none";
	let tenantWarning: string | null = null;

	if (tenant && options.suspendTenant) {
		if (tenant.configurationSetName) {
			const suspendResult = await suspendTenantSending(
				tenant.configurationSetName,
				options.reason,
			);

			if (!suspendResult.success) {
				tenantWarning =
					suspendResult.error ||
					"Failed to disable AWS SES sending; tenant was still marked suspended in the database.";
			}
		}

		const [updatedTenant] = await db
			.update(sesTenants)
			.set({
				status: "suspended",
				updatedAt: now,
			})
			.where(eq(sesTenants.id, tenant.id))
			.returning({
				id: sesTenants.id,
				tenantName: sesTenants.tenantName,
				status: sesTenants.status,
			});

		tenantSummary = updatedTenant
			? `${updatedTenant.id} (${updatedTenant.tenantName}) -> ${updatedTenant.status}`
			: `${tenant.id} (${tenant.tenantName}) -> suspended`;
	} else if (tenant) {
		tenantSummary = `${tenant.id} (${tenant.tenantName}) -> unchanged`;
	}

	console.log(
		alreadyBanned
			? "User was already banned; state refreshed."
			: "User banned.",
	);
	console.log(
		JSON.stringify(
			{
				user: updatedUser,
				cancelledScheduledCount,
				tenant: tenantSummary,
				options: {
					suspendTenant: options.suspendTenant,
					cancelScheduled: options.cancelScheduled,
				},
				warning: tenantWarning,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error("Failed to ban user:", error);
	process.exit(1);
});
