import { SENT_EMAIL_ID_TAG } from "@/app/api/e2/helper/ses-email-tags";

export interface SesOpenEvent {
	eventType: string;
	mail: {
		messageId: string;
		tags?: Record<string, string[]>;
	};
	open?: {
		timestamp: string;
		isBotEvent?: "Likely" | "Unlikely";
	};
}

export interface ParsedOpenEvent {
	sentEmailId: string | null;
	sesMessageId: string;
	openedAt: Date;
}

export function parseOpenEvent(event: SesOpenEvent): ParsedOpenEvent | null {
	if (
		event.eventType !== "open" ||
		!event.open?.timestamp ||
		event.open.isBotEvent === "Likely"
	) {
		return null;
	}

	const openedAt = new Date(event.open.timestamp);
	if (Number.isNaN(openedAt.getTime())) {
		return null;
	}

	return {
		sentEmailId: event.mail.tags?.[SENT_EMAIL_ID_TAG]?.[0] || null,
		sesMessageId: event.mail.messageId,
		openedAt,
	};
}
