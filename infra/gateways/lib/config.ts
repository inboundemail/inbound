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
	// Extra GitHub OIDC claims the deploy role requires (AWS STS condition keys for GitHub, since 2026-02).
	// For a job that doesn't call a reusable workflow, job_workflow_ref is the workflow's own ref.
	githubRepositoryId: "989702246",
	githubRepositoryOwnerId: "230610683",
	githubDeployRef: "refs/heads/main",
	githubDeployWorkflow: "inboundemail/inbound/.github/workflows/deploy-gateway-host.yml",
	releaseRetentionDays: 90,
	// Override with: bunx cdk deploy -c alertEmail=someone@example.com
	alertEmail: "ryan@mandarin3d.com",
	alertTopicName: "inbound-gateway-alerts",
	sessionLogGroupName: "/inbound/gateways/ssm-sessions",
	sessionLogsKeyAlias: "alias/inbound-gateways-session-logs",
	// User data runs only on an instance's first boot, and changing it stops and starts the instance.
	// inbound-host-sync verifies every bundle it applies; set this to true together with the next AMI
	// change (which replaces the instance anyway) so a new instance verifies its first bundle too.
	verifyHostBundleInUserData: false,
} as const;

export type GatewayHostConfig = typeof gatewayHostConfig;
