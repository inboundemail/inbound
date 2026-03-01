import { describe, expect, it } from "bun:test";
import {
	isAgentEmail,
	canUserSendFromEmail,
} from "@/lib/email-management/agent-email-helper";

describe("isAgentEmail", () => {
	it("returns true for exact agent@inbnd.dev", () => {
		expect(isAgentEmail("agent@inbnd.dev")).toBe(true);
	});

	it("is case insensitive", () => {
		expect(isAgentEmail("Agent@INBND.DEV")).toBe(true);
	});

	it("handles Name <email> format", () => {
		expect(isAgentEmail("Inbound Agent <agent@inbnd.dev>")).toBe(true);
	});

	it("returns false for non-agent address", () => {
		expect(isAgentEmail("user@example.com")).toBe(false);
	});

	it("returns false for similar but different address", () => {
		expect(isAgentEmail("agent@inbnd.com")).toBe(false);
	});
});

describe("canUserSendFromEmail", () => {
	it("identifies agent email", () => {
		const result = canUserSendFromEmail("agent@inbnd.dev");
		expect(result.isAgentEmail).toBe(true);
		expect(result.domain).toBe("inbnd.dev");
	});

	it("identifies custom domain", () => {
		const result = canUserSendFromEmail("user@custom.com");
		expect(result.isAgentEmail).toBe(false);
		expect(result.domain).toBe("custom.com");
	});

	it("handles Name <email> format", () => {
		const result = canUserSendFromEmail("My Name <user@mydomain.io>");
		expect(result.isAgentEmail).toBe(false);
		expect(result.domain).toBe("mydomain.io");
	});
});
