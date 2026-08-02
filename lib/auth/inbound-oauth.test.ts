import { describe, expect, it } from "bun:test";

import { parseInboundOAuthGrantSelection } from "@/lib/auth/inbound-oauth-grant";
import {
	buildInboundOAuthSession,
	inboundOAuthNeedsDomainSelection,
	inboundOAuthSessionAllowsDomain,
	parseInboundOAuthSessionReference,
} from "@/lib/auth/inbound-oauth-session";

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

	it("keeps an empty selected grant as a valid no-domain session", () => {
		expect(
			buildInboundOAuthSession(
				{
					id: "grant-empty",
					userId: "user-1",
					mode: "selected",
					domainIds: [],
				},
				domains,
			),
		).toEqual({
			userId: "user-1",
			grantId: "grant-empty",
			domainScope: { mode: "selected", domains: [] },
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

describe("parseInboundOAuthGrantSelection", () => {
	it("accepts and serializes an empty specific-domain selection", () => {
		expect(
			parseInboundOAuthGrantSelection({
				clientId: "client-1",
				mode: "selected",
				domainIds: [],
			}),
		).toEqual({
			clientId: "client-1",
			mode: "selected",
			domainIds: [],
		});
		expect(
			parseInboundOAuthGrantSelection({
				clientId: "client-1",
				mode: "selected",
			}),
		).toBeNull();
	});

	it("deduplicates selected domains and discards domains in all mode", () => {
		expect(
			parseInboundOAuthGrantSelection({
				clientId: "client-1",
				mode: "selected",
				domainIds: ["domain-1", "domain-1"],
			}),
		).toEqual({
			clientId: "client-1",
			mode: "selected",
			domainIds: ["domain-1"],
		});
		expect(
			parseInboundOAuthGrantSelection({
				clientId: "client-1",
				mode: "all",
				domainIds: ["domain-1"],
			}),
		).toEqual({
			clientId: "client-1",
			mode: "all",
			domainIds: [],
		});
	});
});

describe("parseInboundOAuthSessionReference", () => {
	it("accepts only the stable grant reference from an access token", () => {
		expect(
			parseInboundOAuthSessionReference({
				userId: "user-1",
				grantId: "grant-1",
				domainScope: { mode: "all", domains },
			}),
		).toEqual({ userId: "user-1", grantId: "grant-1" });
		expect(parseInboundOAuthSessionReference({ userId: "user-1" })).toBeNull();
		expect(parseInboundOAuthSessionReference("grant-1")).toBeNull();
	});
});

describe("inboundOAuthNeedsDomainSelection", () => {
	it("advances after provider continuation omits the post-login-cleared flag", () => {
		const scopes = ["openid", "inbound:domains"];

		expect(inboundOAuthNeedsDomainSelection(scopes, null)).toBe(true);
		expect(inboundOAuthNeedsDomainSelection(scopes, "grant-1")).toBe(false);
	});

	it("does not enter domain selection for unrelated OAuth requests", () => {
		expect(inboundOAuthNeedsDomainSelection(["openid"], null)).toBe(false);
	});
});

describe("inboundOAuthSessionAllowsDomain", () => {
	const session = {
		userId: "user-1",
		grantId: "grant-1",
		domainScope: {
			mode: "selected" as const,
			domains: [{ id: "domain-1", domain: "alpha.example" }],
		},
	};

	it("matches a domain ID, domain name, or email address", () => {
		expect(inboundOAuthSessionAllowsDomain(session, "domain-1")).toBe(true);
		expect(inboundOAuthSessionAllowsDomain(session, "ALPHA.EXAMPLE")).toBe(
			true,
		);
		expect(
			inboundOAuthSessionAllowsDomain(
				session,
				"Inbound Mail <hello@alpha.example>",
			),
		).toBe(true);
	});

	it("rejects domains outside the grant", () => {
		expect(
			inboundOAuthSessionAllowsDomain(session, "hello@zebra.example"),
		).toBe(false);
		expect(inboundOAuthSessionAllowsDomain(session, undefined)).toBe(false);
	});

	it("rejects every domain when the specific-domain list is empty", () => {
		expect(
			inboundOAuthSessionAllowsDomain(
				{
					...session,
					domainScope: { mode: "selected", domains: [] },
				},
				"alpha.example",
			),
		).toBe(false);
	});
});
