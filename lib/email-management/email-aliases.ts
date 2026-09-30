import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { structuredEmailAliases } from "@/lib/db/schema";

/**
 * Resolves a received-email ID that was merged into another row (one row per
 * message) to the ID of the email that was kept. Unknown IDs are returned as-is.
 */
export async function resolveStructuredEmailId(
	id: string,
	userId: string,
): Promise<string> {
	const [alias] = await db
		.select({ canonicalId: structuredEmailAliases.canonicalId })
		.from(structuredEmailAliases)
		.where(
			and(
				eq(structuredEmailAliases.id, id),
				eq(structuredEmailAliases.userId, userId),
			),
		)
		.limit(1);
	return alias?.canonicalId ?? id;
}
