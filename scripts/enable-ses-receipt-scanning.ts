/**
 * Turns on SES spam and virus scanning (ScanEnabled) for every rule in the
 * active receipt rule set. With scanning on, SES adds spamVerdict and
 * virusVerdict to each received email and still delivers it: none of our
 * rule actions stop on a verdict.
 *
 * Dry run by default; pass --apply to update the rules.
 *
 *   bun run scripts/enable-ses-receipt-scanning.ts
 *   bun run scripts/enable-ses-receipt-scanning.ts --apply
 */
import "dotenv/config";
import {
	DescribeActiveReceiptRuleSetCommand,
	SESClient,
	UpdateReceiptRuleCommand,
} from "@aws-sdk/client-ses";

const region = process.env.AWS_REGION || "us-east-2";
const apply = process.argv.includes("--apply");
const sesClient = new SESClient({ region });

async function enableReceiptScanning(): Promise<void> {
	const active = await sesClient.send(
		new DescribeActiveReceiptRuleSetCommand({}),
	);
	const ruleSetName = active.Metadata?.Name;
	if (!ruleSetName) {
		console.log(`No active receipt rule set in ${region}`);
		return;
	}
	console.log(
		`${apply ? "Applying" : "Dry run"}: rule set ${ruleSetName} (${region})`,
	);

	let updated = 0;
	let unchanged = 0;
	let failed = 0;

	// The active rule set lists every rule with all of its fields, so the
	// update sends each rule back unchanged apart from ScanEnabled
	for (const rule of active.Rules ?? []) {
		const ruleName = rule.Name;
		if (!ruleName) continue;
		try {
			const before = rule.ScanEnabled === true;
			if (before) {
				console.log(`${ruleName}: ScanEnabled true (unchanged)`);
				unchanged++;
				continue;
			}
			if (apply) {
				await sesClient.send(
					new UpdateReceiptRuleCommand({
						RuleSetName: ruleSetName,
						Rule: { ...rule, ScanEnabled: true },
					}),
				);
			}
			console.log(
				`${ruleName}: ScanEnabled false -> true${apply ? "" : " (dry run)"}`,
			);
			updated++;
		} catch (error) {
			console.error(
				`${ruleName}: failed (${error instanceof Error ? error.name : "unknown"})`,
			);
			failed++;
		}
	}

	console.log(
		`${apply ? "Updated" : "Would update"} ${updated}, unchanged ${unchanged}, failed ${failed}`,
	);
	if (failed > 0) process.exitCode = 1;
}

enableReceiptScanning().catch((error) => {
	console.error(
		"Failed to enable receipt scanning:",
		error instanceof Error ? error.name : "unknown",
	);
	process.exit(1);
});
