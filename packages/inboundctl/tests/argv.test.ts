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
});
