import { describe, expect, it } from "bun:test";
import { getDailyLimitForAge } from "@/lib/email-management/warmup-limits";

describe("getDailyLimitForAge", () => {
	it("day 1 → 20", () => {
		expect(getDailyLimitForAge(1)).toBe(20);
	});

	it("day 2 → 40", () => {
		expect(getDailyLimitForAge(2)).toBe(40);
	});

	it("day 3 → 75", () => {
		expect(getDailyLimitForAge(3)).toBe(75);
	});

	it("day 4 falls into day-5 bucket → 150", () => {
		expect(getDailyLimitForAge(4)).toBe(150);
	});

	it("day 5 → 150", () => {
		expect(getDailyLimitForAge(5)).toBe(150);
	});

	it("day 6 falls into day-7 bucket → 300", () => {
		expect(getDailyLimitForAge(6)).toBe(300);
	});

	it("day 7 → 300", () => {
		expect(getDailyLimitForAge(7)).toBe(300);
	});

	it("day 8 falls into day-10 bucket → 500", () => {
		expect(getDailyLimitForAge(8)).toBe(500);
	});

	it("day 10 → 500", () => {
		expect(getDailyLimitForAge(10)).toBe(500);
	});

	it("day 11 falls into day-14 bucket → 1000", () => {
		expect(getDailyLimitForAge(11)).toBe(1000);
	});

	it("day 14 → 1000", () => {
		expect(getDailyLimitForAge(14)).toBe(1000);
	});

	it("day 15 (past warmup) → null", () => {
		expect(getDailyLimitForAge(15)).toBeNull();
	});

	it("day 100 (well past warmup) → null", () => {
		expect(getDailyLimitForAge(100)).toBeNull();
	});
});
