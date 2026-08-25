import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { authenticateManagedMailCredential } from "@/app/api/e2/mailboxes/shared";
import { auth } from "@/lib/auth/auth";

const invalidVerification = {
	valid: false,
	error: { message: "Invalid API key" },
	key: null,
} as Awaited<ReturnType<typeof auth.api.verifyApiKey>>;

afterEach(() => {
	spyOn(auth.api, "verifyApiKey").mockRestore();
});

describe("managed mail credential verification", () => {
	it("rejects invalid credentials after both verifiers respond", async () => {
		const verify = spyOn(auth.api, "verifyApiKey").mockResolvedValue(
			invalidVerification,
		);

		expect(await authenticateManagedMailCredential("mail_invalid")).toBeNull();
		expect(verify).toHaveBeenCalledTimes(2);
	});

	it("propagates an authentication backend outage", async () => {
		spyOn(auth.api, "verifyApiKey").mockRejectedValue(
			new Error("Authentication backend unavailable"),
		);

		await expect(
			authenticateManagedMailCredential("mail_unavailable"),
		).rejects.toThrow("Authentication backend unavailable");
	});

	it("does not classify a failed primary verifier as invalid credentials", async () => {
		spyOn(auth.api, "verifyApiKey")
			.mockRejectedValueOnce(new Error("Primary verifier unavailable"))
			.mockResolvedValueOnce(invalidVerification);

		await expect(
			authenticateManagedMailCredential("mail_mixed"),
		).rejects.toThrow("Primary verifier unavailable");
	});

	it("does not classify a failed fallback verifier as invalid credentials", async () => {
		spyOn(auth.api, "verifyApiKey")
			.mockResolvedValueOnce(invalidVerification)
			.mockRejectedValueOnce(new Error("Fallback verifier unavailable"));

		await expect(
			authenticateManagedMailCredential("mail_mixed"),
		).rejects.toThrow("Fallback verifier unavailable");
	});
});
