import { describe, expect, it } from "bun:test";
import { processAttachments } from "@/app/api/e2/helper/attachment-processor";

describe("processAttachments calendar invitations", () => {
	it("accepts an ICS attachment while preserving MIME parameters and calendar bytes", async () => {
		const calendar = Buffer.from(
			[
				"BEGIN:VCALENDAR",
				"VERSION:2.0",
				"PRODID:-//Example//Calendar Invitation//EN",
				"METHOD:REQUEST",
				"BEGIN:VEVENT",
				"UID:calendar-invitation@example.com",
				"DTSTAMP:20260827T120000Z",
				"DTSTART:20260828T180000Z",
				"DTEND:20260828T190000Z",
				"SUMMARY:Café meetup",
				"ORGANIZER:mailto:organizer@example.com",
				"ATTENDEE;RSVP=TRUE:mailto:attendee@example.com",
				"END:VEVENT",
				"END:VCALENDAR",
				"",
			].join("\r\n"),
			"utf8",
		);
		const content = calendar.toString("base64");
		const contentType = "text/calendar; charset=utf-8; method=REQUEST";
		const attachments = await processAttachments([
			{
				filename: "invitation.ics",
				content,
				content_type: contentType,
			},
		]);

		expect(attachments).toHaveLength(1);
		expect(attachments[0]).toMatchObject({
			filename: "invitation.ics",
			content,
			contentType,
			size: calendar.byteLength,
		});
		expect(Buffer.from(attachments[0].content, "base64")).toEqual(calendar);
	});
});
