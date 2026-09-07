import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils";
import { NextRequest } from "next/server";
import { HOMEPAGE_EXPERIMENT_COOKIE } from "@/lib/homepage-experiment";
import { config, proxy } from "@/proxy";

afterEach(() => {
	spyOn(Math, "random").mockRestore();
});

describe("homepage experiment proxy", () => {
	it.each([
		"control",
		"redesign",
	] as const)("keeps an existing %s assignment without resetting its cookie", (variant) => {
		const request = new NextRequest("https://inbound.new/", {
			headers: {
				cookie: `${HOMEPAGE_EXPERIMENT_COOKIE}=${variant}`,
			},
		});

		const response = proxy(request);

		expect(request.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			variant,
		);
		expect(response.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)).toBeUndefined();
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	it.each([
		["control", "redesign"],
		["redesign", "control"],
	] as const)("overrides an existing %s assignment with variant=%s", (existing, override) => {
		const url = `https://inbound.new/?variant=${override}&source=newsletter`;
		const request = new NextRequest(url, {
			headers: {
				cookie: `${HOMEPAGE_EXPERIMENT_COOKIE}=${existing}`,
			},
		});

		const response = proxy(request);

		expect(request.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			override,
		);
		expect(response.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			override,
		);
		expect(response.headers.get("x-middleware-request-cookie")).toContain(
			`${HOMEPAGE_EXPERIMENT_COOKIE}=${override}`,
		);
		expect(request.nextUrl.href).toBe(url);
		expect(response.headers.get("location")).toBeNull();
	});

	it("assigns control to a missing cookie below the random midpoint", () => {
		spyOn(Math, "random").mockReturnValue(0.49);
		const request = new NextRequest("https://inbound.new/");

		const response = proxy(request);

		expect(request.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			"control",
		);
		expect(response.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			"control",
		);
		expect(response.headers.get("x-middleware-request-cookie")).toBe(
			`${HOMEPAGE_EXPERIMENT_COOKIE}=control`,
		);
	});

	it("replaces an invalid cookie with redesign at the random midpoint", () => {
		spyOn(Math, "random").mockReturnValue(0.5);
		const request = new NextRequest("https://inbound.new/", {
			headers: {
				cookie: `${HOMEPAGE_EXPERIMENT_COOKIE}=invalid`,
			},
		});

		const response = proxy(request);

		expect(request.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			"redesign",
		);
		expect(response.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			"redesign",
		);
	});

	it("ignores an invalid variant override and keeps a valid cookie", () => {
		const request = new NextRequest("https://inbound.new/?variant=invalid", {
			headers: {
				cookie: `${HOMEPAGE_EXPERIMENT_COOKIE}=control`,
			},
		});

		const response = proxy(request);

		expect(request.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value).toBe(
			"control",
		);
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	it("persists assignments for 90 days with browser-accessible lax cookies", () => {
		spyOn(Math, "random").mockReturnValue(0);

		const response = proxy(new NextRequest("https://inbound.new/"));
		const cookie = response.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE);

		expect(cookie).toMatchObject({
			name: HOMEPAGE_EXPERIMENT_COOKIE,
			value: "control",
			maxAge: 90 * 24 * 60 * 60,
			path: "/",
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			httpOnly: false,
		});
		expect(response.headers.get("set-cookie")).toContain("Max-Age=7776000");
		expect(response.headers.get("set-cookie")).not.toContain("HttpOnly");
	});

	it("matches only the homepage", () => {
		expect(
			unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/" }),
		).toBe(true);
		expect(
			unstable_doesMiddlewareMatch({
				config,
				nextConfig: {},
				url: "/?variant=redesign&source=newsletter",
			}),
		).toBe(true);
		expect(
			unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/pricing" }),
		).toBe(false);
		expect(
			unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/api/e2" }),
		).toBe(false);
	});
});
