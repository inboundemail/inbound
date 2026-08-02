import { and, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import {
	getOwnedCredential,
	isUniqueViolation,
	loadCredentialScopes,
	MailboxErrorSchema,
	MailboxSchema,
	MailboxUpdateInputSchema,
	serializeMailbox,
	type ValidatedMailboxInput,
	validateMailboxInput,
} from "@/app/api/e2/mailboxes/shared";
import { db } from "@/lib/db";
import { imapCredentialScopes, imapCredentials } from "@/lib/db/schema";

const UpdateMailboxResponse = t.Object({ data: MailboxSchema });

export const updateMailbox = new Elysia().put(
	"/mailboxes/:id",
	async ({ request, params, body, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const existing = await getOwnedCredential(userId, params.id);
		if (!existing) {
			set.status = 404;
			return { error: "Mailbox not found" };
		}

		const existingScopes = await loadCredentialScopes(userId, [params.id]);
		const changesDefinition =
			body.name !== undefined ||
			body.loginAddress !== undefined ||
			body.accessMode !== undefined ||
			body.scopes !== undefined;
		let validatedData: ValidatedMailboxInput = {
			name: existing.name,
			loginAddress: existing.loginAddress,
			accessMode: existing.accessMode as "read" | "read_write",
			scopes: existingScopes.map((scope) => ({
				...scope,
				scopeKey:
					scope.type === "domain"
						? `domain:${scope.domainId}`
						: `address:${scope.address}`,
				type: scope.type as "domain" | "address",
			})),
		};

		if (changesDefinition) {
			const validated = await validateMailboxInput(userId, {
				name: body.name ?? existing.name,
				loginAddress: body.loginAddress ?? existing.loginAddress,
				accessMode:
					body.accessMode ?? (existing.accessMode as "read" | "read_write"),
				scopes:
					body.scopes ??
					existingScopes.map((scope) => ({
						type: scope.type as "domain" | "address",
						domainId: scope.domainId,
						address: scope.address ?? undefined,
					})),
			});
			if ("error" in validated) {
				set.status = 400;
				return { error: validated.error };
			}
			validatedData = validated.data;
		}

		const now = new Date();
		try {
			const updateCredential = db
				.update(imapCredentials)
				.set({
					name: validatedData.name,
					loginAddress: validatedData.loginAddress,
					accessMode: validatedData.accessMode,
					enabled: body.enabled ?? existing.enabled,
					updatedAt: now,
				})
				.where(
					and(
						eq(imapCredentials.id, params.id),
						eq(imapCredentials.userId, userId),
					),
				);

			if (body.scopes === undefined) {
				await updateCredential;
			} else {
				await db.batch([
					updateCredential,
					db.delete(imapCredentialScopes).where(
						inArray(
							imapCredentialScopes.credentialId,
							db
								.select({ id: imapCredentials.id })
								.from(imapCredentials)
								.where(
									and(
										eq(imapCredentials.id, params.id),
										eq(imapCredentials.userId, userId),
									),
								),
						),
					),
					db.insert(imapCredentialScopes).values(
						validatedData.scopes.map((scope) => ({
							id: scope.id,
							credentialId: params.id,
							type: scope.type,
							domainId: scope.domainId,
							address: scope.address,
							scopeKey: scope.scopeKey,
							createdAt: now,
						})),
					),
				]);
			}
		} catch (error) {
			set.status = isUniqueViolation(error) ? 409 : 500;
			return {
				error: isUniqueViolation(error)
					? "A mailbox with this login address already exists"
					: "Failed to update mailbox",
			};
		}

		return {
			data: serializeMailbox(
				{
					...existing,
					name: validatedData.name,
					loginAddress: validatedData.loginAddress,
					accessMode: validatedData.accessMode,
					enabled: body.enabled ?? existing.enabled,
					updatedAt: now,
				},
				body.scopes === undefined
					? existingScopes
					: validatedData.scopes.map((scope) => ({
							...scope,
							credentialId: params.id,
						})),
			),
		};
	},
	{
		params: t.Object({ id: t.String() }),
		body: MailboxUpdateInputSchema,
		response: {
			200: UpdateMailboxResponse,
			400: MailboxErrorSchema,
			401: MailboxErrorSchema,
			403: MailboxErrorSchema,
			404: MailboxErrorSchema,
			409: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Update a managed mailbox" },
	},
);
