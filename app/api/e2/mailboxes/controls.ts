import {
	authorizeMailboxAccess,
	type MailboxAccessResult,
} from "@/app/api/e2/mailboxes/access";

type ElysiaSet = { status?: number | string; headers?: unknown };

export type MailboxControl = "filters" | "spam";

/**
 * Authorizes managing a mailbox's filters or spam settings. The account's API
 * key (or session) always may; the mailbox's own password only when the
 * account turned on self-service for that control.
 */
export async function authorizeMailboxControl(
	request: Request,
	set: ElysiaSet,
	mailboxId: string,
	control: MailboxControl,
): Promise<MailboxAccessResult> {
	const result = await authorizeMailboxAccess(request, set, mailboxId);
	if (!result.ok || result.access.via === "account") return result;
	if (!result.access.credential.selfService[control]) {
		return {
			ok: false,
			status: 403,
			error:
				control === "filters"
					? "This mailbox can't manage its own filters"
					: "This mailbox can't manage its own spam settings",
		};
	}
	return result;
}
