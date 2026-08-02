import { describe, expect, it } from "bun:test";
import { ConnectionLimits } from "./limits.ts";

describe("ConnectionLimits", () => {
	it("enforces and releases per-IP connections", () => {
		const limits = new ConnectionLimits(2, 3, 60_000);
		const first = { remoteAddress: "192.0.2.1" };
		const second = { remoteAddress: "192.0.2.1" };
		const third = { remoteAddress: "192.0.2.1" };

		expect(limits.onConnect(first)).toBeNull();
		expect(limits.onConnect(second)).toBeNull();
		expect(limits.onConnect(third)).toBeInstanceOf(Error);
		limits.onClose(first);
		expect(limits.onConnect(third)).toBeNull();
	});

	it("blocks repeated authentication failures and clears on success", () => {
		const limits = new ConnectionLimits(2, 2, 60_000);
		limits.recordAuthFailure("192.0.2.2");
		expect(limits.assertAuthAllowed("192.0.2.2")).toBeNull();
		limits.recordAuthFailure("192.0.2.2");
		expect(limits.assertAuthAllowed("192.0.2.2")).toBeInstanceOf(Error);
		limits.recordAuthSuccess("192.0.2.2");
		expect(limits.assertAuthAllowed("192.0.2.2")).toBeNull();
	});
});
