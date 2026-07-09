interface SesReputationEvent {
	eventType: string;
	complaint?: {
		complaintSubType?: string | null;
	};
}

export function shouldTrackSesReputationEvent(
	event: SesReputationEvent,
): boolean {
	return !(
		event.eventType === "complaint" &&
		event.complaint?.complaintSubType === "OnAccountSuppressionList"
	);
}
