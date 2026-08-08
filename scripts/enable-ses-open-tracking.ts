import "dotenv/config";
import {
	EventType,
	GetConfigurationSetEventDestinationsCommand,
	SESv2Client,
	UpdateConfigurationSetEventDestinationCommand,
} from "@aws-sdk/client-sesv2";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sesTenants } from "@/lib/db/schema";

const region = process.env.AWS_REGION || "us-east-2";
const dryRun = process.argv.includes("--dry-run");
const sesClient = new SESv2Client({ region });

async function enableSesOpenTracking(): Promise<void> {
	const tenants = await db
		.select({
			tenantName: sesTenants.tenantName,
			configurationSetName: sesTenants.configurationSetName,
		})
		.from(sesTenants)
		.where(isNotNull(sesTenants.configurationSetName));

	let updated = 0;
	let unchanged = 0;
	let failed = 0;

	for (const tenant of tenants) {
		const configurationSetName = tenant.configurationSetName;
		if (!configurationSetName) {
			continue;
		}

		try {
			const response = await sesClient.send(
				new GetConfigurationSetEventDestinationsCommand({
					ConfigurationSetName: configurationSetName,
				}),
			);
			const destination = response.EventDestinations?.find(
				(candidate) =>
					candidate.Name === `${configurationSetName}-sns-events`,
			);

			if (!destination?.SnsDestination?.TopicArn) {
				console.error(
					`Missing SNS event destination for ${tenant.tenantName} (${configurationSetName})`,
				);
				failed++;
				continue;
			}

			const eventTypes = Array.from(
				new Set([...(destination.MatchingEventTypes || []), EventType.OPEN]),
			);
			if (
				destination.MatchingEventTypes?.includes(EventType.OPEN) &&
				destination.Enabled
			) {
				console.log(`Open tracking already enabled for ${configurationSetName}`);
				unchanged++;
				continue;
			}

			if (dryRun) {
				console.log(`Would enable open tracking for ${configurationSetName}`);
				updated++;
				continue;
			}

			await sesClient.send(
				new UpdateConfigurationSetEventDestinationCommand({
					ConfigurationSetName: configurationSetName,
					EventDestinationName: destination.Name,
					EventDestination: {
						Enabled: true,
						MatchingEventTypes: eventTypes,
						SnsDestination: {
							TopicArn: destination.SnsDestination.TopicArn,
						},
					},
				}),
			);
			console.log(`Enabled open tracking for ${configurationSetName}`);
			updated++;
		} catch (error) {
			console.error(
				`Failed to enable open tracking for ${configurationSetName}:`,
				error instanceof Error ? error.message : error,
			);
			failed++;
		}
	}

	console.log(
		`Open tracking ${dryRun ? "dry run" : "backfill"} complete: ${updated} updated, ${unchanged} unchanged, ${failed} failed`,
	);
	if (failed > 0) {
		process.exitCode = 1;
	}
}

await enableSesOpenTracking();
