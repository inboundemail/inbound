"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { userOnboarding } from "@/lib/db/schema";

async function getAuthorizedUserId(requestedUserId?: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return { error: "Unauthorized" } as const;
	}
	if (requestedUserId && requestedUserId !== session.user.id) {
		return {
			error: "Forbidden - can only update your own onboarding status",
		} as const;
	}
	return { userId: session.user.id } as const;
}

async function markOnboardingComplete(userId: string) {
	const now = new Date();
	const [onboarding] = await db
		.insert(userOnboarding)
		.values({
			id: nanoid(),
			userId,
			isCompleted: true,
			defaultEndpointCreated: false,
			completedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: userOnboarding.userId,
			set: {
				isCompleted: true,
				completedAt: now,
				updatedAt: now,
			},
		})
		.returning();

	return onboarding;
}

export async function completeOnboarding(userId?: string) {
	try {
		const authorized = await getAuthorizedUserId(userId);
		if ("error" in authorized) {
			return { success: false, error: authorized.error };
		}

		const onboarding = await markOnboardingComplete(authorized.userId);
		return { success: true, onboarding };
	} catch (error) {
		console.error("Failed to complete onboarding:", error);
		return {
			success: false,
			error: "Failed to complete onboarding",
			details: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

export async function skipOnboarding(userId?: string) {
	try {
		const authorized = await getAuthorizedUserId(userId);
		if ("error" in authorized) {
			return { success: false, error: authorized.error };
		}

		const onboarding = await markOnboardingComplete(authorized.userId);
		return { success: true, onboarding };
	} catch (error) {
		console.error("Failed to skip onboarding:", error);
		return {
			success: false,
			error: "Failed to skip onboarding",
			details: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

export async function getOnboardingStatus(userId?: string) {
	try {
		const authorized = await getAuthorizedUserId(userId);
		if ("error" in authorized) {
			return { success: false, error: authorized.error };
		}

		const [onboarding] = await db
			.select()
			.from(userOnboarding)
			.where(eq(userOnboarding.userId, authorized.userId))
			.limit(1);

		return {
			success: true,
			onboarding: onboarding ?? {
				isCompleted: false,
				defaultEndpointCreated: false,
			},
		};
	} catch (error) {
		console.error("Failed to get onboarding status:", error);
		return {
			success: false,
			error: "Failed to get onboarding status",
			details: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
