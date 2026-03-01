import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { TenantSendingInfo } from "@/lib/aws-ses/identity-arn-helper";
import { extractEmailAddress } from "@/lib/utils/email-utils";

/**
 * Build a SendEmailCommand for SES with tenant-level tracking.
 * Shared between handleScheduledEmail and handleBatchEmail.
 */
export function buildSesCommand(params: {
	fromAddress: string;
	toAddresses: string[];
	ccAddresses: string[];
	bccAddresses: string[];
	rawMessage: string;
	tenantSendingInfo: TenantSendingInfo;
}): SendEmailCommand {
	return new SendEmailCommand({
		FromEmailAddress: params.fromAddress,
		...(params.tenantSendingInfo.identityArn && {
			FromEmailAddressIdentityArn: params.tenantSendingInfo.identityArn,
		}),
		Destination: {
			ToAddresses: params.toAddresses.map(extractEmailAddress),
			CcAddresses:
				params.ccAddresses.length > 0
					? params.ccAddresses.map(extractEmailAddress)
					: undefined,
			BccAddresses:
				params.bccAddresses.length > 0
					? params.bccAddresses.map(extractEmailAddress)
					: undefined,
		},
		Content: {
			Raw: {
				Data: Buffer.from(params.rawMessage),
			},
		},
		...(params.tenantSendingInfo.configurationSetName && {
			ConfigurationSetName: params.tenantSendingInfo.configurationSetName,
		}),
		...(params.tenantSendingInfo.tenantName && {
			TenantName: params.tenantSendingInfo.tenantName,
		}),
	});
}
