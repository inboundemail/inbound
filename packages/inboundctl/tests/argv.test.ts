import { describe, expect, it } from "bun:test";
import { optionBoolean, optionString, parseArgv } from "../src/argv";

describe("parseArgv", () => {
	it("parses mailbox shorthand and flags", () => {
		const parsed = parseArgv([
			"-m",
			"exon",
			"--unread",
			"--limit=25",
			"--json",
		]);
		expect(parsed.positionals).toEqual([]);
		expect(optionString(parsed, "mailbox")).toBe("exon");
		expect(optionString(parsed, "limit")).toBe("25");
		expect(optionBoolean(parsed, "unread")).toBe(true);
		expect(optionBoolean(parsed, "json")).toBe(true);
	});

	it("does not consume positionals after boolean long options", () => {
		const parsed = parseArgv([
			"--json",
			"send",
			"--dry-run",
			"message.inbound",
		]);

		expect(parsed.positionals).toEqual(["send", "message.inbound"]);
		expect(optionBoolean(parsed, "json")).toBe(true);
		expect(optionBoolean(parsed, "dry-run")).toBe(true);
	});

	it("continues to consume values for long value options", () => {
		const parsed = parseArgv(["--mailbox", "support", "inbox", "list"]);

		expect(parsed.positionals).toEqual(["inbox", "list"]);
		expect(optionString(parsed, "mailbox")).toBe("support");
	});

	it("keeps a mailbox selector after force", () => {
		const parsed = parseArgv([
			"mailbox",
			"add",
			"support",
			"--force",
			"support@example.com",
		]);

		expect(parsed.positionals).toEqual([
			"mailbox",
			"add",
			"support",
			"support@example.com",
		]);
		expect(optionBoolean(parsed, "force")).toBe(true);
	});
});
