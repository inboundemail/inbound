import { describe, expect, it } from "bun:test";
import {
	isDsn,
	parseDsn,
	quickIsDsnCheck,
} from "@/lib/email-management/dsn-parser";

const SES_MESSAGE_ID =
	"010f019ae693fb1b-50675262-d740-487c-97b8-e6de49d2e104-000000";

function buildDsnRawContentWithLfOnly(): string {
	return [
		"From: MAILER-DAEMON@example.net",
		'Content-Type: multipart/report; report-type=delivery-status; boundary="dsn-boundary"',
		`In-Reply-To: <${SES_MESSAGE_ID}@us-east-2.amazonses.com>`,
		`References: <thread-123> <${SES_MESSAGE_ID}>`,
		"",
		"--dsn-boundary",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		"Delivery failed",
		"--dsn-boundary",
		"Content-Type: message/delivery-status",
		"",
		"Reporting-MTA: dns; mx.example.net",
		"Action: failed",
		"Status: 5.1.1",
		"Final-Recipient: rfc822; bounce-target@example.com",
		`Original-Message-ID: <${SES_MESSAGE_ID}@us-east-2.amazonses.com>`,
		"Diagnostic-Code: smtp; 550 5.1.1 user unknown",
		"",
		"--dsn-boundary--",
	].join("\n");
}

describe("dsn-parser", () => {
	it("parses delivery-status section with LF-only separators", async () => {
		const dsn = await parseDsn(buildDsnRawContentWithLfOnly());

		expect(dsn.isDsn).toBe(true);
		expect(dsn.deliveryStatus?.action).toBe("failed");
		expect(dsn.deliveryStatus?.status).toBe("5.1.1");
		expect(dsn.deliveryStatus?.finalRecipient).toBe(
			"bounce-target@example.com",
		);
	});

	it("keeps reference IDs even without @ and captures Original-Message-ID", async () => {
		const dsn = await parseDsn(buildDsnRawContentWithLfOnly());

		expect(dsn.references).toContain("thread-123");
		expect(dsn.references).toContain(SES_MESSAGE_ID);
		expect(dsn.deliveryStatus?.originalMessageId).toBe(
			`${SES_MESSAGE_ID}@us-east-2.amazonses.com`,
		);
	});

	it("classifies 5.x.x as permanent failure (hard bounce)", async () => {
		const dsn = await parseDsn(buildDsnRawContentWithLfOnly());
		expect(dsn.statusClass).toBe("5");
		expect(dsn.bounceType).toBe("hard");
	});

	it("extracts diagnostic code", async () => {
		const dsn = await parseDsn(buildDsnRawContentWithLfOnly());
		expect(dsn.deliveryStatus?.diagnosticCode).toContain("550 5.1.1");
	});
});

describe("isDsn", () => {
	it("returns true for content with delivery-status indicators", () => {
		expect(isDsn(buildDsnRawContentWithLfOnly())).toBe(true);
	});

	it("returns true when headers indicate delivery-status", () => {
		expect(
			isDsn("plain body", {
				"content-type": {
					value: "multipart/report",
					params: { "report-type": "delivery-status" },
				},
			}),
		).toBe(true);
	});

	it("returns false for regular email content", () => {
		expect(isDsn("Hello, this is a normal email.")).toBe(false);
	});
});

describe("quickIsDsnCheck", () => {
	it("extracts recipient and status from DSN content", () => {
		const result = quickIsDsnCheck(buildDsnRawContentWithLfOnly());
		expect(result.isDsn).toBe(true);
		expect(result.finalRecipient).toBe("bounce-target@example.com");
		expect(result.status).toBe("5.1.1");
		expect(result.diagnosticCode).toContain("550 5.1.1");
	});

	it("returns isDsn false for non-DSN content", () => {
		const result = quickIsDsnCheck("Just a normal email.");
		expect(result.isDsn).toBe(false);
		expect(result.finalRecipient).toBeUndefined();
	});
});
