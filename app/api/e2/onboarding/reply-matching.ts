export interface OnboardingReplyCandidate {
	fromData: string | null;
	subject: string | null;
	receivedAt: Date | null;
	inReplyTo: string | null;
	references: string | null;
}

export interface OnboardingDemoReference {
	recipientEmail: string;
	sentAt: Date | null;
	messageId: string | null;
}

function normalizeMessageId(value: string | null | undefined) {
	return value?.trim().replace(/^<|>$/g, "").toLowerCase() ?? "";
}

function parseReferences(value: string | null) {
	if (!value) return [];

	try {
		const parsed: unknown = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return parsed.filter((item): item is string => typeof item === "string");
		}
	} catch {}

	return value.split(/\s+/).filter(Boolean);
}

export function getOnboardingSender(fromData: string | null) {
	if (!fromData) return null;

	try {
		const parsed: unknown = JSON.parse(fromData);
		if (!parsed || typeof parsed !== "object") return null;

		const addresses = "addresses" in parsed ? parsed.addresses : null;
		if (Array.isArray(addresses)) {
			const firstAddress = addresses.find(
				(address) =>
					address &&
					typeof address === "object" &&
					"address" in address &&
					typeof address.address === "string",
			);
			if (
				firstAddress &&
				typeof firstAddress === "object" &&
				"address" in firstAddress &&
				typeof firstAddress.address === "string"
			) {
				return firstAddress.address.trim().toLowerCase();
			}
		}

		const text =
			"text" in parsed && typeof parsed.text === "string" ? parsed.text : "";
		const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
		return match?.[0].toLowerCase() ?? null;
	} catch {
		return null;
	}
}

export function isOnboardingReply(
	candidate: OnboardingReplyCandidate,
	demo: OnboardingDemoReference,
) {
	const sender = getOnboardingSender(candidate.fromData);
	if (!sender || sender !== demo.recipientEmail.trim().toLowerCase())
		return false;
	if (
		!candidate.receivedAt ||
		!demo.sentAt ||
		candidate.receivedAt < demo.sentAt
	)
		return false;

	const expectedMessageId = normalizeMessageId(demo.messageId);
	if (expectedMessageId) {
		if (normalizeMessageId(candidate.inReplyTo) === expectedMessageId)
			return true;
		if (
			parseReferences(candidate.references)
				.map(normalizeMessageId)
				.includes(expectedMessageId)
		) {
			return true;
		}
	}

	return (
		candidate.subject?.toLowerCase().includes("welcome to inbound") ?? false
	);
}
