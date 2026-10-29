import { Elysia, t } from "elysia";
import {
	authorizeMailboxAccess,
	canWrite,
	type MailboxAccess,
} from "@/app/api/e2/mailboxes/access";
import {
	ErrorSchema,
	ensureFolders,
	expungeMessages,
	FolderSchema,
	findFolder,
	folderCounts,
	folderOperation,
	folderPathFromParam,
	type MailboxOwnerRef,
	mailboxStateFailure,
	serializeFolder,
	syncReceivedFolders,
} from "@/app/api/e2/mailboxes/state";
import type { ImapMailbox } from "@/lib/db/schema";
import {
	isProtectedMailboxPath,
	isScopeMailboxPath,
} from "@/packages/imap-gateway/src/mailbox-rules";

type ElysiaSet = { status?: number | string; headers?: unknown };

export function fail(set: ElysiaSet, status: number, error: string) {
	set.status = status;
	return { error };
}

export function ownerOf(access: MailboxAccess): MailboxOwnerRef {
	return {
		userId: access.userId,
		credentialId: access.credential.credentialId,
	};
}

export type FolderContext =
	| {
			ok: true;
			access: MailboxAccess;
			owner: MailboxOwnerRef;
			folder: ImapMailbox;
	  }
	| { ok: false; status: number; error: string };

export async function resolveFolder(
	request: Request,
	set: ElysiaSet,
	mailboxId: string,
	folderParam: string,
	options: { write?: boolean } = {},
): Promise<FolderContext> {
	const result = await authorizeMailboxAccess(request, set, mailboxId);
	if (!result.ok) return result;
	if (options.write && !canWrite(result.access.credential)) {
		return { ok: false, status: 403, error: "This mailbox is read-only" };
	}
	const path = folderPathFromParam(folderParam);
	if (!path) return { ok: false, status: 400, error: "Invalid folder path" };
	const owner = ownerOf(result.access);
	const folder = await findFolder(owner, path);
	if (!folder) return { ok: false, status: 404, error: "Folder not found" };
	return { ok: true, access: result.access, owner, folder };
}

export function handleStateError(set: ElysiaSet, error: unknown) {
	const failure = mailboxStateFailure(error);
	if (!failure) throw error;
	return fail(set, failure.status, failure.error);
}

const MailboxParams = t.Object({ id: t.String() });
const FolderParams = t.Object({
	id: t.String(),
	folder: t.String({
		description:
			"Folder path, URL-encoded as one segment (for example `INBOX`, `Archive`, `Projects%2F2026` or `Scopes%2F*%40example.com`)",
	}),
});

const errorResponses = {
	400: ErrorSchema,
	401: ErrorSchema,
	403: ErrorSchema,
	404: ErrorSchema,
	409: ErrorSchema,
};

export const listMailboxFolders = new Elysia().get(
	"/mailboxes/:id/folders",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const owner = ownerOf(result.access);
		try {
			const folders = await syncReceivedFolders(
				owner,
				await ensureFolders(owner),
			);
			const counts = await folderCounts(folders.map((folder) => folder.id));
			return {
				data: folders.map((folder) =>
					serializeFolder(folder, counts.get(folder.id)),
				),
			};
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: MailboxParams,
		response: {
			200: t.Object({ data: t.Array(FolderSchema) }),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "List mailbox folders",
			description:
				"List the mailbox's folders (the same folders IMAP shows): INBOX, Sent, Drafts, Trash, Junk, Archive, one read-only Scopes/… folder per scope, and folders created by the user, with message and unread counts.",
		},
	},
);

export const createMailboxFolder = new Elysia().post(
	"/mailboxes/:id/folders",
	async ({ request, params, body, set }) => {
		const result = await authorizeMailboxAccess(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		if (!canWrite(result.access.credential)) {
			return fail(set, 403, "This mailbox is read-only");
		}
		const path = folderPathFromParam(body.path);
		if (!path) return fail(set, 400, "Invalid folder path");
		if (isScopeMailboxPath(path)) {
			return fail(
				set,
				400,
				"Scope folders are managed by the mailbox's scopes",
			);
		}
		const owner = ownerOf(result.access);
		try {
			if (isProtectedMailboxPath(path)) {
				await ensureFolders(owner);
				return fail(set, 409, "A folder with that path already exists");
			}
			const created = await folderOperation(owner, "create", path);
			if (created.length === 0) {
				return fail(set, 409, "A folder with that path already exists");
			}
			if (body.subscribed === false) {
				await folderOperation(owner, "subscribe", path, { subscribed: false });
			}
			const folder = await findFolder(owner, path);
			if (!folder) return fail(set, 404, "Folder not found");
			set.status = 201;
			return serializeFolder(folder, { total: 0, unread: 0 });
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: MailboxParams,
		body: t.Object({
			path: t.String({
				minLength: 1,
				maxLength: 255,
				description:
					"Folder path; use `/` to nest (for example `Projects/2026`)",
			}),
			subscribed: t.Optional(t.Boolean({ description: "Default true" })),
		}),
		response: { 201: FolderSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Create a mailbox folder",
			description:
				"Requires a read_write mailbox. Visible over IMAP right away.",
		},
	},
);

export const updateMailboxFolder = new Elysia().patch(
	"/mailboxes/:id/folders/:folder",
	async ({ request, params, body, set }) => {
		const context = await resolveFolder(
			request,
			set,
			params.id,
			params.folder,
			{
				write: true,
			},
		);
		if (!context.ok) return fail(set, context.status, context.error);
		const { owner, folder } = context;
		let path = folder.path;
		try {
			if (body.path !== undefined) {
				const newPath = folderPathFromParam(body.path);
				if (!newPath) return fail(set, 400, "Invalid folder path");
				if (newPath !== path) {
					if (isProtectedMailboxPath(path) || folder.scopeId) {
						return fail(set, 400, "Special and scope folders can't be renamed");
					}
					if (isScopeMailboxPath(newPath)) {
						return fail(
							set,
							400,
							"Scope folders are managed by the mailbox's scopes",
						);
					}
					if (isProtectedMailboxPath(newPath)) {
						return fail(set, 409, "A folder with that path already exists");
					}
					const renamed = await folderOperation(owner, "rename", path, {
						newPath,
					});
					if (renamed.length === 0) return fail(set, 404, "Folder not found");
					path = newPath;
				}
			}
			if (body.subscribed !== undefined) {
				await folderOperation(owner, "subscribe", path, {
					subscribed: body.subscribed,
				});
			}
			const updated = await findFolder(owner, path);
			if (!updated) return fail(set, 404, "Folder not found");
			const counts = await folderCounts([updated.id]);
			return serializeFolder(updated, counts.get(updated.id));
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: FolderParams,
		body: t.Object(
			{
				path: t.Optional(
					t.String({
						minLength: 1,
						maxLength: 255,
						description: "New path. Subfolders move with the folder.",
					}),
				),
				subscribed: t.Optional(t.Boolean()),
			},
			{ minProperties: 1 },
		),
		response: { 200: FolderSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Rename or subscribe a mailbox folder",
			description:
				"Requires a read_write mailbox. Special folders (INBOX, Sent, Drafts, Trash, Junk, Archive) and scope folders can't be renamed.",
		},
	},
);

export const deleteMailboxFolder = new Elysia().delete(
	"/mailboxes/:id/folders/:folder",
	async ({ request, params, set }) => {
		const context = await resolveFolder(
			request,
			set,
			params.id,
			params.folder,
			{
				write: true,
			},
		);
		if (!context.ok) return fail(set, context.status, context.error);
		const { owner, folder } = context;
		if (isProtectedMailboxPath(folder.path) || folder.scopeId) {
			return fail(set, 400, "Special and scope folders can't be deleted");
		}
		try {
			const deleted = await folderOperation(owner, "delete", folder.path);
			if (deleted.length === 0) return fail(set, 404, "Folder not found");
			return { path: folder.path, deleted: true };
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: FolderParams,
		response: {
			200: t.Object({ path: t.String(), deleted: t.Boolean() }),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Delete a mailbox folder",
			description:
				"Requires a read_write mailbox. Deletes the folder and its messages (received mail stays in the account). Subfolders are kept.",
		},
	},
);

export const expungeMailboxFolder = new Elysia().post(
	"/mailboxes/:id/folders/:folder/expunge",
	async ({ request, params, body, set }) => {
		const context = await resolveFolder(
			request,
			set,
			params.id,
			params.folder,
			{
				write: true,
			},
		);
		if (!context.ok) return fail(set, context.status, context.error);
		try {
			const expunged = await expungeMessages(
				context.owner,
				context.folder.id,
				body?.uids ?? null,
			);
			return { path: context.folder.path, expunged };
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: FolderParams,
		body: t.Optional(
			t.Object({
				uids: t.Optional(
					t.Array(t.Integer({ minimum: 1 }), {
						maxItems: 1000,
						description:
							"Only expunge these UIDs (if they are flagged \\Deleted)",
					}),
				),
			}),
		),
		response: {
			200: t.Object({ path: t.String(), expunged: t.Array(t.Number()) }),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Expunge a mailbox folder",
			description:
				"Requires a read_write mailbox. Permanently removes the folder's messages flagged \\Deleted, like IMAP EXPUNGE, and returns their UIDs.",
		},
	},
);
