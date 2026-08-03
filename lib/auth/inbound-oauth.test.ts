import { describe, expect, it } from "bun:test";

import { buildInboundOAuthSession } from "@/lib/auth/inbound-oauth-session";

const domains = [
	{ id: "domain-2", domain: "zebra.example" },
	{ id: "domain-1", domain: "alpha.example" },
];

describe("buildInboundOAuthSession", () => {
	it("returns every current domain for an all-domains grant", () => {
		expect(
			buildInboundOAuthSession(
				{
					id: "grant-1",
					userId: "user-1",
					mode: "all",
					domainIds: [],
				},
				domains,
			),
		).toEqual({
			userId: "user-1",
			grantId: "grant-1",
			domainScope: {
				mode: "all",
				domains: [domains[1], domains[0]],
			},
		});
	});

	it("returns only explicitly selected domains", () => {
		expect(
			buildInboundOAuthSession(
				{
					id: "grant-2",
					userId: "user-1",
					mode: "selected",
					domainIds: ["domain-2"],
				},
				domains,
			),
		).toEqual({
			userId: "user-1",
			grantId: "grant-2",
			domainScope: {
				mode: "selected",
				domains: [domains[0]],
			},
		});
	});

	it("invalidates a selected grant when a domain is no longer owned", () => {
		expect(
			buildInboundOAuthSession(
				{
					id: "grant-3",
					userId: "user-1",
					mode: "selected",
					domainIds: ["domain-1", "domain-missing"],
				},
				domains,
			),
		).toBeNull();
	});
});
