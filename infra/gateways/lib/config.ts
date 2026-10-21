export const gatewayHostConfig = {
	account: "375612485665",
	region: "us-east-2",
	vpcId: "vpc-098ccbebc01a562c2",
	availabilityZone: "us-east-2c",
	subnetId: "subnet-0643bb6db9d083af0",
	// Pinned so a new Canonical release never replaces the instance on deploy.
	// Refresh: aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id
	amiId: "ami-0c2550644d9503dc6",
	instanceType: "t4g.small",
	rootVolumeGiB: 16,
	ingressPorts: [465, 587, 993],
	acmeZoneName: "acme.inboundemail.com",
	parentDomain: "inboundemail.com",
	gatewayHostnames: {
		smtp: "smtp.inboundemail.com",
		imap: "imap.inboundemail.com",
	},
	parameterPrefix: "/inbound/gateways",
	secretsKeyAlias: "alias/inbound-gateways",
	deployDocumentName: "InboundGatewayDeploy",
	deployRoleName: "github-gateway-host-deploy",
	githubOidcProviderArn:
		"arn:aws:iam::375612485665:oidc-provider/token.actions.githubusercontent.com",
	githubSubject: "repo:inboundemail/inbound:environment:production",
	releaseRetentionDays: 90,
} as const;

export type GatewayHostConfig = typeof gatewayHostConfig;
