import {
	enforceAuthenticatedUserAndRateLimit,
	validateAndRateLimit,
} from "@/app/api/e2/lib/auth";
import {
	authenticateManagedMailCredential,
	normalizeEmailAddress,
} from "@/app/api/e2/mailboxes/shared";

export interface ManagedSenderPolicy {
	sendingMode: "identity" | "scoped_domains";
	sendingAddress: string | null;
	allowedDomains: string[];
}

export async function authenticateEmailSend(
	request: Request,
	set: { status?: number | string; headers?: unknown },
): Promise<{ userId: string; senderPolicy: ManagedSenderPolicy | null }> {
	const authorization = request.headers.get("authorization");
	const apiKey = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
	if (apiKey?.startsWith("mail_") || apiKey?.startsWith("imap_")) {
		const credential = await authenticateManagedMailCredential(apiKey);
		if (credential) {
			await enforceAuthenticatedUserAndRateLimit(credential.userId, set);
			return {
				userId: credential.userId,
				senderPolicy: {
					sendingMode: credential.sendingMode,
					sendingAddress: credential.sendingAddress,
					allowedDomains: credential.allowedDomains,
				},
			};
		}
	}

	return {
		userId: await validateAndRateLimit(request, set),
		senderPolicy: null,
	};
}

export function senderPolicyAllowsAddress(
	policy: ManagedSenderPolicy,
	fromAddress: string,
): boolean {
	const address = normalizeEmailAddress(fromAddress);
	if (!address) return false;
	if (policy.sendingMode === "identity") {
		return address === policy.sendingAddress;
	}

	const domain = address.slice(address.lastIndexOf("@") + 1);
	return policy.allowedDomains.includes(domain);
}
