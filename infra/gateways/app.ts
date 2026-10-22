import { App, Tags } from "aws-cdk-lib";
import { gatewayHostConfig } from "./lib/config.ts";
import { GatewayHostStack } from "./lib/gateway-host-stack.ts";

const app = new App();

const stack = new GatewayHostStack(app, "InboundGatewayHost", {
	env: { account: gatewayHostConfig.account, region: gatewayHostConfig.region },
	description:
		"Consolidated EC2 host for the Inbound SMTP and IMAP gateways (packages/smtp-gateway, packages/imap-gateway)",
	terminationProtection: true,
	config: gatewayHostConfig,
	alertEmail: app.node.tryGetContext("alertEmail"),
});

Tags.of(stack).add("Project", "inbound");
Tags.of(stack).add("Component", "gateway-host");
Tags.of(stack).add("Environment", "production");
Tags.of(stack).add("ManagedBy", "cdk:infra/gateways");
Tags.of(stack).add("Repository", "inboundemail/inbound");
