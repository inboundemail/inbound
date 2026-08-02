import { describe, expect, it } from "bun:test";
import {
	getOnboardingSender,
	isOnboardingReply,
} from "@/app/api/e2/onboarding/reply-matching";

const sentAt = new Date("2026-07-12T12:00:00.000Z");
const demo = {
	recipientEmail: "person@example.com",
	sentAt,
	messageId: "onboarding-123@inbnd.dev",
};

describe("onboarding reply matching", () => {
	it("extracts an exact normalized sender", () => {
		expect(
			getOnboardingSender(
				JSON.stringify({
					text: "Person <Person@Example.com>",
					addresses: [{ name: "Person", address: "Person@Example.com" }],
				}),
			),
		).toBe("person@example.com");
	});

	it("rejects empty or malformed sender data", () => {
		expect(getOnboardingSender(null)).toBeNull();
		expect(getOnboardingSender("{}")).toBeNull();
	});

	it("matches the exact reply thread", () => {
		expect(
			isOnboardingReply(
				{
					fromData: JSON.stringify({
						addresses: [{ address: "person@example.com" }],
					}),
					subject: "Re: Welcome to Inbound! Reply to complete setup",
					receivedAt: new Date("2026-07-12T12:01:00.000Z"),
					inReplyTo: "<onboarding-123@inbnd.dev>",
					references: null,
				},
				demo,
			),
		).toBe(true);
	});

	it("rejects old or lookalike senders", () => {
		const candidate = {
			fromData: JSON.stringify({
				addresses: [{ address: "person@another.example" }],
			}),
			subject: "Re: Welcome to Inbound! Reply to complete setup",
			receivedAt: new Date("2026-07-12T12:01:00.000Z"),
			inReplyTo: "<onboarding-123@inbnd.dev>",
			references: null,
		};

		expect(isOnboardingReply(candidate, demo)).toBe(false);
		expect(
			isOnboardingReply(
				{
					...candidate,
					fromData: JSON.stringify({
						addresses: [{ address: "person@example.com" }],
					}),
					receivedAt: new Date("2026-07-12T11:59:00.000Z"),
				},
				demo,
			),
		).toBe(false);
	});
});
