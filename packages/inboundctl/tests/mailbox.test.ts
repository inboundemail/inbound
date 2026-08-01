import { describe, expect, it } from "bun:test";
import { createMailbox, resolveMailbox } from "../src/mailbox";

describe("mailbox selectors", () => {
	it("separates exact addresses and wildcard domains", () => {
		const mailbox = createMailbox("ryan@exon.dev", [
			"me@exon.dev",
			"*@exon.com",
			"ryan@exon.dev",
		]);
		const scope = resolveMailbox({
			version: 1,
			baseUrl: "https://inbound.new",
			defaultMailbox: "exon",
			mailboxes: { exon: mailbox },
		});
		expect(scope.addresses).toEqual(["me@exon.dev", "ryan@exon.dev"]);
		expect(scope.domains).toEqual(["exon.com"]);
		expect(scope.from).toBe("ryan@exon.dev");
	});

	it("rejects unsupported wildcard forms", () => {
		expect(() => createMailbox(undefined, ["sales+*@example.com"])).toThrow(
			"Invalid mailbox selector",
		);
	});
});
