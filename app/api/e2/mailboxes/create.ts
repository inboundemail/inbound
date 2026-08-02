import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import {
	deleteMailApiKey,
	isUniqueViolation,
	MailboxErrorSchema,
	MailboxInputSchema,
	MailboxSchema,
	serializeMailbox,
	validateMailboxInput,
} from "@/app/api/e2/mailboxes/shared";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { imapCredentialScopes, imapCredentials } from "@/lib/db/schema";

const CreateMailboxResponse = t.Object({
	data: MailboxSchema,
	password: t.String(),
});

export const createMailbox = new Elysia().post(
	"/mailboxes",
	async ({ request, body, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const validated = await validateMailboxInput(userId, body);
		if ("error" in validated) {
			set.status = 400;
			return { error: validated.error };
		}

		const apiKey = await auth.api.createApiKey({
			body: {
				configId: "mail",
				name: validated.data.name,
				userId,
			},
		});
		const id = nanoid();
		const now = new Date();
		const credential = {
			id,
			userId,
			apiKeyId: apiKey.id,
			name: validated.data.name,
			loginAddress: validated.data.loginAddress,
			type: validated.data.type,
			accessMode: validated.data.accessMode,
			sendingMode: validated.data.sendingMode,
			sendingName: validated.data.sendingName,
			sendingAddress: validated.data.sendingAddress,
			enabled: true,
			lastUsedAt: null,
			createdAt: now,
			updatedAt: now,
		};

		try {
			await db.batch([
				db.insert(imapCredentials).values(credential),
				db.insert(imapCredentialScopes).values(
					validated.data.scopes.map((scope) => ({
						id: scope.id,
						credentialId: id,
						type: scope.type,
						domainId: scope.domainId,
						address: scope.address,
						scopeKey: scope.scopeKey,
						createdAt: now,
					})),
				),
			]);
		} catch (error) {
			try {
				await deleteMailApiKey(apiKey.id, userId);
			} catch (cleanupError) {
				console.error("Failed to clean up mail API key:", cleanupError);
			}

			set.status = isUniqueViolation(error) ? 409 : 500;
			return {
				error: isUniqueViolation(error)
					? "A mailbox with this login address already exists"
					: "Failed to create mailbox",
			};
		}

		set.status = 201;
		return {
			data: serializeMailbox(
				credential,
				validated.data.scopes.map((scope) => ({
					...scope,
					credentialId: id,
				})),
			),
			password: apiKey.key,
		};
	},
	{
		body: MailboxInputSchema,
		response: {
			201: CreateMailboxResponse,
			400: MailboxErrorSchema,
			401: MailboxErrorSchema,
			403: MailboxErrorSchema,
			409: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Create a managed mailbox" },
	},
);
