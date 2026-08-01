import { describe, expect, it } from "bun:test";
import { validateMessage } from "../src/validate";

describe("message validation", () => {
	it("accepts a complete text message", () => {
		const result = validateMessage({
			from: "Ryan <ryan@example.com>",
			to: ["person@example.com"],
			subject: "Hello",
			text: "Hello there",
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it("blocks unsafe HTML and warns about missing fallback", () => {
		const result = validateMessage({
			from: "ryan@example.com",
			to: ["person@example.com"],
			subject: "Hello {{name}}",
			html: '<script>alert(1)</script><img src="x">',
		});
		expect(result.valid).toBe(false);
		expect(result.errors.map((issue) => issue.code)).toContain(
			"unsafe_html_element",
		);
		expect(result.warnings.map((issue) => issue.code)).toContain(
			"missing_text_fallback",
		);
		expect(result.warnings.map((issue) => issue.code)).toContain(
			"unresolved_placeholder",
		);
	});

	it("allows replies to derive recipients and subject from the thread", () => {
		const result = validateMessage(
			{
				from: "ryan@example.com",
				text: "Thanks",
			},
			{ reply: true },
		);
		expect(result.valid).toBe(true);
	});
});
