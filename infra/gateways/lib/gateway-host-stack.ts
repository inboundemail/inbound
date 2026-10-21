import { fileURLToPath } from "node:url";
import {
	Annotations,
	CfnOutput,
	aws_cloudwatch as cloudwatch,
	aws_cloudwatch_actions as cwActions,
	Duration,
	aws_ec2 as ec2,
	Fn,
	aws_iam as iam,
	aws_kms as kms,
	RemovalPolicy,
	aws_route53 as route53,
	Stack,
	type StackProps,
	aws_s3 as s3,
	aws_s3_assets as s3assets,
	aws_ssm as ssm,
	Tags,
	Validations,
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { GatewayHostConfig } from "./config.ts";

export interface GatewayHostStackProps extends StackProps {
	config: GatewayHostConfig;
}

export class GatewayHostStack extends Stack {
	constructor(scope: Construct, id: string, props: GatewayHostStackProps) {
		super(scope, id, props);
		const cfg = props.config;
		const parameterArn = (path: string) =>
			`arn:aws:ssm:${this.region}:${this.account}:parameter${path}`;

		const vpc = ec2.Vpc.fromVpcAttributes(this, "DefaultVpc", {
			vpcId: cfg.vpcId,
			availabilityZones: [cfg.availabilityZone],
		});
		const subnet = ec2.Subnet.fromSubnetAttributes(this, "PublicSubnet", {
			subnetId: cfg.subnetId,
			availabilityZone: cfg.availabilityZone,
		});
		Annotations.of(subnet).acknowledgeWarning(
			"@aws-cdk/aws-ec2:noSubnetRouteTableId",
			"Only used for instance placement",
		);

		const securityGroup = new ec2.SecurityGroup(this, "GatewaySecurityGroup", {
			vpc,
			description: "Inbound gateway host: SMTP submission and IMAP only",
			allowAllOutbound: true,
		});
		for (const port of cfg.ingressPorts) {
			securityGroup.addIngressRule(
				ec2.Peer.anyIpv4(),
				ec2.Port.tcp(port),
				`gateway tcp/${port}`,
			);
		}

		const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			encryption: s3.BucketEncryption.S3_MANAGED,
			enforceSSL: true,
			versioned: true,
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			removalPolicy: RemovalPolicy.RETAIN,
			lifecycleRules: [
				{
					id: "expire-releases",
					prefix: "releases/",
					expiration: Duration.days(cfg.releaseRetentionDays),
					noncurrentVersionExpiration: Duration.days(7),
					abortIncompleteMultipartUploadAfter: Duration.days(1),
				},
			],
		});

		const acmeZone = new route53.PublicHostedZone(this, "AcmeZone", {
			zoneName: cfg.acmeZoneName,
			comment:
				"ACME DNS-01 challenges for the Inbound gateways (CNAME-delegated from Vercel DNS)",
		});
		acmeZone.applyRemovalPolicy(RemovalPolicy.RETAIN);
		const challengeNames = Object.keys(cfg.gatewayHostnames).map(
			(name) => `${name}.${cfg.acmeZoneName}`,
		);

		const hostBundle = new s3assets.Asset(this, "HostBundle", {
			path: fileURLToPath(new URL("../host", import.meta.url)),
		});

		const hostParameters = [
			new ssm.StringParameter(this, "HostBundleUrlParam", {
				parameterName: `${cfg.parameterPrefix}/host/bundle-url`,
				stringValue: hostBundle.s3ObjectUrl,
				description: "S3 URL of the gateway host bundle (infra/gateways/host)",
			}),
			new ssm.StringParameter(this, "ArtifactBucketParam", {
				parameterName: `${cfg.parameterPrefix}/host/artifact-bucket`,
				stringValue: artifactBucket.bucketName,
			}),
			new ssm.StringParameter(this, "AcmeZoneIdParam", {
				parameterName: `${cfg.parameterPrefix}/host/acme-zone-id`,
				stringValue: acmeZone.hostedZoneId,
			}),
		];

		const secretsKey = new kms.Key(this, "GatewaySecretsKey", {
			alias: cfg.secretsKeyAlias,
			description: `Encrypts the SecureString parameters under ${cfg.parameterPrefix}`,
			enableKeyRotation: true,
			removalPolicy: RemovalPolicy.RETAIN,
		});

		const instanceRole = new iam.Role(this, "InstanceRole", {
			assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
			description: "Inbound gateway host instance role",
			managedPolicies: [
				iam.ManagedPolicy.fromAwsManagedPolicyName(
					"AmazonSSMManagedInstanceCore",
				),
			],
		});
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "ReadGatewayParameters",
				actions: [
					"ssm:GetParameter",
					"ssm:GetParameters",
					"ssm:GetParametersByPath",
				],
				resources: [parameterArn(`${cfg.parameterPrefix}/*`)],
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "DenyOtherParameters",
				effect: iam.Effect.DENY,
				actions: [
					"ssm:GetParameter",
					"ssm:GetParameters",
					"ssm:GetParametersByPath",
					"ssm:GetParameterHistory",
				],
				notResources: [
					parameterArn(cfg.parameterPrefix),
					parameterArn(`${cfg.parameterPrefix}/*`),
				],
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "DecryptGatewayParameters",
				actions: ["kms:Decrypt"],
				resources: [secretsKey.keyArn],
				conditions: {
					StringEquals: {
						"kms:ViaService": `ssm.${this.region}.amazonaws.com`,
					},
					StringLike: {
						"kms:EncryptionContext:PARAMETER_ARN": parameterArn(
							`${cfg.parameterPrefix}/*`,
						),
					},
				},
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "ReadReleases",
				actions: ["s3:GetObject"],
				resources: [artifactBucket.arnForObjects("releases/*")],
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "ReadHostBundle",
				actions: ["s3:GetObject"],
				resources: [
					`arn:aws:s3:::${hostBundle.s3BucketName}/${hostBundle.s3ObjectKey}`,
				],
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "AcmeChallengeRecords",
				actions: ["route53:ChangeResourceRecordSets"],
				resources: [acmeZone.hostedZoneArn],
				conditions: {
					"ForAllValues:StringEquals": {
						"route53:ChangeResourceRecordSetsNormalizedRecordNames":
							challengeNames,
						"route53:ChangeResourceRecordSetsRecordTypes": ["TXT"],
					},
				},
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "AcmeZoneRead",
				actions: ["route53:ListResourceRecordSets"],
				resources: [acmeZone.hostedZoneArn],
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "AcmeChangeStatus",
				actions: ["route53:GetChange"],
				resources: ["arn:aws:route53:::change/*"],
			}),
		);

		const userData = ec2.UserData.custom(
			[
				"#!/bin/bash",
				"set -euo pipefail",
				"(umask 027 && touch /var/log/inbound-bootstrap.log) && chown root:adm /var/log/inbound-bootstrap.log && chmod 0640 /var/log/inbound-bootstrap.log",
				"exec >>/var/log/inbound-bootstrap.log 2>&1",
				'echo "== user data $(date -Is)"',
				`export AWS_REGION=${this.region} AWS_DEFAULT_REGION=${this.region} PATH="$PATH:/snap/bin" INBOUND_BOOTSTRAP_LOGGING=1 INBOUND_BOOTSTRAP_FROM_USER_DATA=1`,
				"for attempt in $(seq 1 10); do command -v aws >/dev/null && break; snap install aws-cli --classic || sleep 15; done",
				`for attempt in $(seq 1 30); do url=$(aws ssm get-parameter --name ${cfg.parameterPrefix}/host/bundle-url --query Parameter.Value --output text) && break; sleep 10; done`,
				"dir=$(mktemp -d)",
				'aws s3 cp "$url" "$dir/host.zip" --only-show-errors',
				'python3 -m zipfile -e "$dir/host.zip" "$dir/host"',
				'bash "$dir/host/bootstrap.sh" "$url"',
				'rm -rf "$dir"',
			].join("\n"),
		);

		const instance = new ec2.Instance(this, "Host", {
			instanceName: "inbound-gateway-host",
			vpc,
			vpcSubnets: { subnets: [subnet] },
			instanceType: new ec2.InstanceType(cfg.instanceType),
			machineImage: ec2.MachineImage.genericLinux({ [cfg.region]: cfg.amiId }),
			securityGroup,
			role: instanceRole,
			userData,
			httpEndpoint: true,
			httpTokens: ec2.HttpTokens.REQUIRED,
			httpPutResponseHopLimit: 1,
			disableApiTermination: true,
			propagateTagsToVolumeOnCreation: true,
			blockDevices: [
				{
					deviceName: "/dev/sda1",
					volume: ec2.BlockDeviceVolume.ebs(cfg.rootVolumeGiB, {
						volumeType: ec2.EbsDeviceVolumeType.GP3,
						encrypted: true,
						deleteOnTermination: true,
					}),
				},
			],
		});
		instance.node.addDependency(instanceRole, ...hostParameters);
		Validations.of(instance).acknowledge({
			id: "CloudFormation-Validate::W9010",
			reason: "AMI is pinned so a new Canonical image never replaces the host",
		});
		Tags.of(instance).add("Backup", "none");
		Tags.of(instance).add("Services", "smtp-gateway,imap-gateway");

		const eip = new ec2.CfnEIP(this, "HostEip", {
			domain: "vpc",
			tags: [{ key: "Name", value: "inbound-gateway-host" }],
		});
		eip.applyRemovalPolicy(RemovalPolicy.RETAIN);
		new ec2.CfnEIPAssociation(this, "HostEipAssociation", {
			allocationId: eip.attrAllocationId,
			instanceId: instance.instanceId,
		});

		new cloudwatch.Alarm(this, "SystemStatusRecovery", {
			alarmName: "inbound-gateway-host-system-status-recover",
			alarmDescription:
				"Recover the gateway host when the underlying EC2 hardware fails",
			metric: new cloudwatch.Metric({
				namespace: "AWS/EC2",
				metricName: "StatusCheckFailed_System",
				dimensionsMap: { InstanceId: instance.instanceId },
				statistic: cloudwatch.Stats.MAXIMUM,
				period: Duration.minutes(1),
			}),
			evaluationPeriods: 2,
			threshold: 1,
			comparisonOperator:
				cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
			treatMissingData: cloudwatch.TreatMissingData.MISSING,
		}).addAlarmAction(
			new cwActions.Ec2Action(cwActions.Ec2InstanceAction.RECOVER),
		);

		new ssm.CfnDocument(this, "DeployDocument", {
			name: cfg.deployDocumentName,
			documentType: "Command",
			documentFormat: "JSON",
			updateMethod: "NewVersion",
			targetType: "/AWS::EC2::Instance",
			content: {
				schemaVersion: "2.2",
				description:
					"Deploy a verified gateway release artifact on the Inbound gateway host",
				parameters: {
					gateway: {
						type: "String",
						description: "Gateway to deploy",
						allowedValues: ["smtp", "imap", "both"],
					},
					s3Key: {
						type: "String",
						description: "Artifact key in the release bucket",
						allowedPattern:
							"^releases/(smtp|imap|both)-[0-9a-f]{40}(-dirty[0-9]{1,12})?\\.tar\\.gz$",
					},
					sha256: {
						type: "String",
						description: "Expected SHA-256 of the artifact",
						allowedPattern: "^[0-9a-f]{64}$",
					},
				},
				mainSteps: [
					{
						action: "aws:runShellScript",
						name: "deploy",
						inputs: {
							timeoutSeconds: "1200",
							runCommand: [
								"set -eu",
								"/usr/local/sbin/inbound-host-sync",
								"exec /usr/local/sbin/inbound-deploy '{{ gateway }}' '{{ s3Key }}' '{{ sha256 }}'",
							],
						},
					},
				],
			},
		});

		const githubOidc = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
			this,
			"GithubOidc",
			cfg.githubOidcProviderArn,
		);
		const deployRole = new iam.Role(this, "GithubDeployRole", {
			roleName: cfg.deployRoleName,
			description:
				"GitHub Actions (production environment) deploys to the Inbound gateway host",
			maxSessionDuration: Duration.hours(1),
			assumedBy: new iam.OpenIdConnectPrincipal(githubOidc, {
				StringEquals: {
					"token.actions.githubusercontent.com:sub": cfg.githubSubject,
					"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
				},
			}),
		});
		deployRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "UploadReleases",
				actions: ["s3:PutObject"],
				resources: [artifactBucket.arnForObjects("releases/*")],
			}),
		);
		deployRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "RunDeployDocument",
				actions: ["ssm:SendCommand"],
				resources: [
					`arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`,
					`arn:aws:ssm:${this.region}:${this.account}:document/${cfg.deployDocumentName}`,
				],
			}),
		);
		deployRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "ReadDeployResults",
				actions: ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"],
				resources: ["*"],
			}),
		);

		new CfnOutput(this, "InstanceId", { value: instance.instanceId });
		new CfnOutput(this, "ElasticIp", { value: eip.attrPublicIp });
		new CfnOutput(this, "ArtifactBucketName", {
			value: artifactBucket.bucketName,
		});
		new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
		new CfnOutput(this, "DeployDocumentName", {
			value: cfg.deployDocumentName,
		});
		new CfnOutput(this, "AcmeZoneId", { value: acmeZone.hostedZoneId });
		new CfnOutput(this, "SecretsKeyArn", { value: secretsKey.keyArn });

		const acmeLabel = cfg.acmeZoneName.slice(0, -(cfg.parentDomain.length + 1));
		const nameServers = acmeZone.hostedZoneNameServers ?? [];
		new CfnOutput(this, "AcmeNameServers", {
			value: Fn.join(",", nameServers),
		});
		for (const index of [0, 1, 2, 3]) {
			new CfnOutput(this, `VercelAcmeNs${index + 1}`, {
				description: `Vercel DNS: delegate ${cfg.acmeZoneName} to Route 53`,
				value: Fn.join("", [
					`vercel dns add ${cfg.parentDomain} ${acmeLabel} NS `,
					Fn.select(index, nameServers),
				]),
			});
		}
		for (const [name, hostname] of Object.entries(cfg.gatewayHostnames)) {
			const label = hostname.slice(0, -(cfg.parentDomain.length + 1));
			new CfnOutput(
				this,
				`VercelAcmeCname${name[0].toUpperCase()}${name.slice(1)}`,
				{
					description: `Vercel DNS: point the ${hostname} ACME challenge at Route 53`,
					value: `vercel dns add ${cfg.parentDomain} _acme-challenge.${label} CNAME ${name}.${cfg.acmeZoneName}`,
				},
			);
		}
	}
}
