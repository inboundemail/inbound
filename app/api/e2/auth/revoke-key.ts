import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { apikey } from "@/lib/db/auth-schema";

const SuccessResponse = t.Object({
	success: t.Literal(true),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const revokeCurrentApiKey = new Elysia().post(
	"/auth/revoke-key",
	async ({ request, set }) => {
		const authorization = request.headers.get("authorization");
		const key = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
		if (!key) {
			set.status = 401;
			return { error: "A valid API key is required" };
		}

		const authApi = auth.api as {
			verifyApiKey?: (input: {
				body: { key: string; configId: string };
			}) => Promise<{
				valid: boolean;
				error?: unknown;
				key?: { id?: string | null } | null;
			}>;
		};
		const verified = await authApi.verifyApiKey?.({
			body: { key, configId: "default" },
		});
		const keyId = verified?.valid && !verified.error ? verified.key?.id : null;
		if (!keyId) {
			set.status = 401;
			return { error: "A valid API key is required" };
		}

		await db
			.delete(apikey)
			.where(and(eq(apikey.id, keyId), eq(apikey.configId, "default")));
		return { success: true as const };
	},
	{
		response: {
			200: SuccessResponse,
			401: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Authentication"],
			summary: "Revoke the current API key",
			description:
				"Permanently revokes the API key used to authenticate this request.",
		},
	},
);
