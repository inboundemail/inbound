/**
 * Download URL for a received attachment, addressed by its position in the
 * message. Positions are stable: the stored message never changes, and
 * ingestion stores the parser's attachment list unfiltered and in order.
 * Filenames are not unique and may be missing, so they can't address a part.
 */
export function attachmentDownloadUrl(emailId: string, index: number): string {
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://inbound.new";
	return `${baseUrl}/api/e2/attachments/${encodeURIComponent(emailId)}/parts/${index}`;
}
