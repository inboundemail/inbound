import { afterEach, expect, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
	domainV2Keys,
	type GetDomainsResponse,
	useDomainsListV2Query,
} from "@/features/domains/hooks/useDomainV2Hooks";

const targetId = "indm_domain_on_second_page";
const domains = Array.from({ length: 169 }, (_, index) => ({
	id: index === 120 ? targetId : `domain-${index}`,
	domain: index === 120 ? "older-bakery.example" : `bakery-${index}.test`,
	status: "verified",
	canReceiveEmails: true,
	stats: {
		totalEmailAddresses: 0,
		activeEmailAddresses: 0,
		hasCatchAll: false,
	},
}));
const requests: URL[] = [];
const clients: QueryClient[] = [];
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

afterEach(() => {
	fetchSpy?.mockRestore();
	for (const client of clients) client.clear();
	clients.length = 0;
	requests.length = 0;
});

function mockPages(failOffset?: number) {
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		requests.push(url);
		const offset = Number(url.searchParams.get("offset") ?? 0);
		const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
		if (offset === failOffset) {
			return Response.json(
				{ message: "Domain list unavailable" },
				{ status: 503 },
			);
		}
		return Response.json({
			data: domains.slice(offset, offset + limit),
			pagination: {
				limit,
				offset,
				total: domains.length,
				hasMore: offset + limit < domains.length,
			},
		});
	});
}

function domainQuery(params: Parameters<typeof useDomainsListV2Query>[0]) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	clients.push(client);
	function Probe() {
		useDomainsListV2Query(params);
		return null;
	}
	renderToString(
		createElement(QueryClientProvider, { client }, createElement(Probe)),
	);
	const query = client.getQueryCache().find<GetDomainsResponse>({
		queryKey: domainV2Keys.list(params),
		exact: true,
	});
	if (!query) throw new Error("Domain query was not registered");
	return client.fetchQuery({ ...query.options, queryKey: query.queryKey });
}

test("loads domains beyond the first 100 so name and ID searches find them", async () => {
	mockPages();
	const result = await domainQuery({ limit: 100, fetchAll: true });
	expect(requests.map((url) => url.searchParams.get("offset"))).toEqual([
		"0",
		"100",
	]);
	expect(result.data).toHaveLength(169);
	expect(
		result.data.filter((domain) => domain.domain.includes("older-bakery")),
	).toEqual([domains[120]]);
	expect(result.data.find((domain) => domain.id === targetId)).toEqual(
		domains[120],
	);
	expect(result.meta.verifiedCount).toBe(169);
	expect(result.pagination).toEqual({
		limit: 169,
		offset: 0,
		total: 169,
		hasMore: false,
	});
});

test("preserves single-page queries and their pagination", async () => {
	mockPages();
	const result = await domainQuery({ limit: 100 });
	expect(requests).toHaveLength(1);
	expect(result.data).toHaveLength(100);
	expect(result.data.some((domain) => domain.id === targetId)).toBe(false);
	expect(result.pagination.hasMore).toBe(true);
});

test("follows server page sizes and carries filters to every page", async () => {
	mockPages();
	const result = await domainQuery({
		limit: 1000,
		fetchAll: true,
		status: "verified",
		canReceive: "true",
	});
	expect(result.data).toHaveLength(169);
	expect(requests.map((url) => url.searchParams.get("offset"))).toEqual([
		"0",
		"100",
	]);
	for (const url of requests) {
		expect(url.searchParams.get("status")).toBe("verified");
		expect(url.searchParams.get("canReceive")).toBe("true");
		expect(url.searchParams.has("fetchAll")).toBe(false);
	}
});

test("reports later-page failures instead of returning an incomplete list", async () => {
	mockPages(100);
	await expect(domainQuery({ limit: 100, fetchAll: true })).rejects.toBeInstanceOf(
		Error,
	);
	expect(requests).toHaveLength(2);
});
