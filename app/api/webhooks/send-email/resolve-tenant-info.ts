import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";

/**
 * Resolve tenant sending info (identity ARN, configuration set, tenant name)
 * for a given user/domain/agent combination. Shared between handleScheduledEmail
 * and handleBatchEmail.
 */
export async function resolveTenantInfo(
	userId: string,
	fromDomain: string,
	isAgentEmail: boolean,
	label: string,
): Promise<TenantSendingInfo> {
	let tenantSendingInfo: TenantSendingInfo = {
		identityArn: null,
		configurationSetName: null,
		tenantName: null,
	};

	if (isAgentEmail) {
		tenantSendingInfo = {
			identityArn: getAgentIdentityArn(),
			configurationSetName: null,
			tenantName: null,
		};
	} else {
		const parentDomain = isSubdomain(fromDomain)
			? getRootDomain(fromDomain)
			: undefined;
		tenantSendingInfo = await getTenantSendingInfoForDomainOrParent(
			userId,
			fromDomain,
			parentDomain || undefined,
		);
	}

	if (tenantSendingInfo.identityArn) {
		console.log(
			`🏢 Using SourceArn for ${label} tenant tracking: ${tenantSendingInfo.identityArn}`,
		);
	} else {
		console.warn(
			`⚠️ No SourceArn available - ${label} will not be tracked at tenant level`,
		);
	}

	if (tenantSendingInfo.configurationSetName) {
		console.log(
			`📋 Using ConfigurationSet for ${label} tenant tracking: ${tenantSendingInfo.configurationSetName}`,
		);
	} else {
		console.warn(
			`⚠️ No ConfigurationSet available - ${label} metrics may not be tracked correctly`,
		);
	}

	if (tenantSendingInfo.tenantName) {
		console.log(
			`🏠 Using TenantName for ${label} AWS SES tracking: ${tenantSendingInfo.tenantName}`,
		);
	} else {
		console.warn(
			`⚠️ No TenantName available - ${label} will NOT appear in tenant dashboard!`,
		);
	}

	return tenantSendingInfo;
}
