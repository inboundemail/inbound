import { describe, expect, it } from "bun:test";
import { getSesConfigurationSetName } from "@/lib/ses-monitoring/configuration-set";

describe("getSesConfigurationSetName", () => {
	it("uses the configuration set from SES v2 mail tags", () => {
		expect(
			getSesConfigurationSetName({
				tags: {
					"ses:configuration-set": ["tenant-user-123"],
				},
			}),
		).toBe("tenant-user-123");
	});

	it("prefers an explicit configuration set name", () => {
		expect(
			getSesConfigurationSetName({
				configurationSetName: "legacy-config",
				tags: {
					"ses:configuration-set": ["tagged-config"],
				},
			}),
		).toBe("legacy-config");
	});

	it("selects the first nonblank tagged value", () => {
		expect(
			getSesConfigurationSetName({
				tags: {
					"ses:configuration-set": ["", "  ", " tenant-user-456 "],
				},
			}),
		).toBe("tenant-user-456");
	});

	it("returns undefined for missing or malformed tags", () => {
		expect(getSesConfigurationSetName({})).toBeUndefined();
		expect(
			getSesConfigurationSetName({
				tags: { "ses:configuration-set": "tenant-user-123" },
			}),
		).toBeUndefined();
	});
});
