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
	aws_logs as logs,
	RemovalPolicy,
	aws_route53 as route53,
	Stack,
	type StackProps,
	aws_s3 as s3,
	aws_s3_assets as s3assets,
	aws_sns as sns,
	aws_sns_subscriptions as snsSubscriptions,
	aws_ssm as ssm,
	Tags,
	Validations,
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { GatewayHostConfig } from "./config.ts";
import { hostBundleExclude, hostBundleManifest } from "./host-bundle.ts";

export interface GatewayHostStackProps extends StackProps {
	config: GatewayHostConfig;
	/** Email address subscribed to the alert topic (defaults to config.alertEmail). */
	alertEmail?: string;
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

		const hostDir = fileURLToPath(new URL("../host", import.meta.url));
		const hostBundle = new s3assets.Asset(this, "HostBundle", {
			path: hostDir,
			exclude: hostBundleExclude,
		});

		const alertTopic = new sns.Topic(this, "AlertTopic", {
			topicName: cfg.alertTopicName,
			displayName: "Inbound gateway host alerts",
		});
		const alertEmail = props.alertEmail ?? cfg.alertEmail;
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alertEmail)) {
			throw new Error(`alertEmail is not an email address: ${alertEmail}`);
		}
		alertTopic.addSubscription(
			new snsSubscriptions.EmailSubscription(alertEmail),
		);

		const hostParameters = [
			new ssm.StringParameter(this, "HostBundleUrlParam", {
				parameterName: `${cfg.parameterPrefix}/host/bundle-url`,
				stringValue: hostBundle.s3ObjectUrl,
				description: "S3 URL of the gateway host bundle (infra/gateways/host)",
			}),
			new ssm.StringParameter(this, "HostBundleManifestParam", {
				parameterName: `${cfg.parameterPrefix}/host/bundle-sha256`,
				stringValue: hostBundleManifest(hostDir),
				description:
					"sha256sum manifest of the host bundle, checked by inbound-host-sync before bootstrap.sh runs",
			}),
			new ssm.StringParameter(this, "AlertTopicArnParam", {
				parameterName: `${cfg.parameterPrefix}/host/alert-topic-arn`,
				stringValue: alertTopic.topicArn,
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
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "PublishAlerts",
				actions: ["sns:Publish"],
				resources: [alertTopic.topicArn],
			}),
		);

		const sessionLogGroupArn = `arn:aws:logs:${this.region}:${this.account}:log-group:${cfg.sessionLogGroupName}`;
		const sessionLogsKey = new kms.Key(this, "SessionLogsKey", {
			alias: cfg.sessionLogsKeyAlias,
			description: `Encrypts the Session Manager transcripts in ${cfg.sessionLogGroupName}`,
			enableKeyRotation: true,
			removalPolicy: RemovalPolicy.RETAIN,
		});
		sessionLogsKey.addToResourcePolicy(
			new iam.PolicyStatement({
				sid: "CloudWatchLogsSessionLogGroup",
				principals: [
					new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`),
				],
				actions: [
					"kms:Encrypt*",
					"kms:Decrypt*",
					"kms:ReEncrypt*",
					"kms:GenerateDataKey*",
					"kms:Describe*",
				],
				resources: ["*"],
				conditions: {
					ArnEquals: {
						"kms:EncryptionContext:aws:logs:arn": sessionLogGroupArn,
					},
				},
			}),
		);
		const sessionLogGroup = new logs.LogGroup(this, "SessionLogGroup", {
			logGroupName: cfg.sessionLogGroupName,
			retention: logs.RetentionDays.THREE_MONTHS,
			encryptionKey: sessionLogsKey,
			removalPolicy: RemovalPolicy.RETAIN,
		});
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "WriteSessionLogs",
				actions: [
					"logs:CreateLogStream",
					"logs:PutLogEvents",
					"logs:DescribeLogStreams",
				],
				resources: [sessionLogGroup.logGroupArn],
			}),
		);
		instanceRole.addToPolicy(
			new iam.PolicyStatement({
				sid: "CheckSessionLogGroupEncryption",
				actions: ["logs:DescribeLogGroups"],
				resources: [
					`arn:aws:logs:${this.region}:${this.account}:log-group:*`,
				],
			}),
		);

		// Session Manager preferences for the whole account in this region (this host is the only
		// managed instance here). Every session's transcript streams to the encrypted log group.
		const sessionPreferences = new ssm.CfnDocument(
			this,
			"SessionManagerPreferences",
			{
				name: "SSM-SessionManagerRunShell",
				documentType: "Session",
				documentFormat: "JSON",
				updateMethod: "NewVersion",
				content: {
					schemaVersion: "1.0",
					description:
						"Session Manager preferences: log every shell session to CloudWatch Logs",
					sessionType: "Standard_Stream",
					inputs: {
						s3BucketName: "",
						s3KeyPrefix: "",
						s3EncryptionEnabled: true,
						cloudWatchLogGroupName: cfg.sessionLogGroupName,
						cloudWatchEncryptionEnabled: true,
						cloudWatchStreamingEnabled: true,
						kmsKeyId: "",
						runAsEnabled: false,
						runAsDefaultUser: "",
						idleSessionTimeout: "20",
						maxSessionDuration: "",
						shellProfile: { windows: "", linux: "" },
					},
				},
			},
		);
		sessionPreferences.node.addDependency(sessionLogGroup, instanceRole);

		const userDataHeader = [
			"#!/bin/bash",
			"set -euo pipefail",
			"(umask 027 && touch /var/log/inbound-bootstrap.log) && chown root:adm /var/log/inbound-bootstrap.log && chmod 0640 /var/log/inbound-bootstrap.log",
			"exec >>/var/log/inbound-bootstrap.log 2>&1",
			'echo "== user data $(date -Is)"',
			`export AWS_REGION=${this.region} AWS_DEFAULT_REGION=${this.region} PATH="$PATH:/snap/bin" INBOUND_BOOTSTRAP_LOGGING=1 INBOUND_BOOTSTRAP_FROM_USER_DATA=1`,
			"for attempt in $(seq 1 10); do command -v aws >/dev/null && break; snap install aws-cli --classic || sleep 15; done",
		];
		// Same checks as host/sbin/inbound-host-sync, for the first boot of a new instance.
		const verifiedBundleUserData = [
			...userDataHeader,
			'dir=$(mktemp -d)',
			`python3 - "$dir" ${cfg.parameterPrefix} '${cfg.account}-${cfg.region}' <<'PY'`,
			...String.raw`import hashlib, json, os, re, subprocess, sys, time, zipfile
dest, prefix, account_region = sys.argv[1:4]
names = [prefix + "/host/bundle-url", prefix + "/host/bundle-sha256"]
for attempt in range(30):
    r = subprocess.run(["aws", "ssm", "get-parameters", "--names", *names, "--output", "json"], capture_output=True, text=True)
    if r.returncode == 0:
        values = {p["Name"]: p["Value"] for p in json.loads(r.stdout)["Parameters"]}
        if len(values) == 2:
            break
    time.sleep(10)
else:
    sys.exit("REFUSING host bundle: SSM parameters unavailable")
url, manifest = values[names[0]], values[names[1]]
def refuse(why):
    sys.exit("REFUSING host bundle %s: %s" % (url, why))
if not re.fullmatch(r"s3://cdk-hnb659fds-assets-" + re.escape(account_region) + r"/[0-9a-f]{64}\.zip", url):
    refuse("unexpected bundle URL")
expected = {}
for line in manifest.split("\n"):
    m = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9._@-]+(?:/[A-Za-z0-9._@-]+)*)", line)
    if not m or m[2] in expected or any(part in (".", "..") for part in m[2].split("/")):
        refuse("malformed manifest line %r" % line)
    expected[m[2]] = m[1]
if "bootstrap.sh" not in expected:
    refuse("manifest has no bootstrap.sh")
archive = os.path.join(dest, "host.zip")
subprocess.run(["aws", "s3", "cp", url, archive, "--only-show-errors"], check=True)
with zipfile.ZipFile(archive) as z:
    members = [i for i in z.infolist() if not i.is_dir()]
    if sorted(i.filename for i in members) != sorted(expected):
        refuse("file list differs from the manifest")
    for i in members:
        data = z.read(i)
        if hashlib.sha256(data).hexdigest() != expected[i.filename]:
            refuse("sha256 mismatch for " + i.filename)
        path = os.path.join(dest, "host", i.filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
with open(archive, "rb") as f:
    print("host bundle verified: %s (%d files, zip sha256 %s)" % (url, len(expected), hashlib.sha256(f.read()).hexdigest()))
with open(os.path.join(dest, "url"), "w") as f:
    f.write(url)
PY`.split("\n"),
			'url=$(cat "$dir/url")',
			'bash "$dir/host/bootstrap.sh" "$url"',
			'rm -rf "$dir"',
		];
		// The user data the instance was created with. Changing it stops and starts the instance.
		const unverifiedBundleUserData = [
			...userDataHeader,
			`for attempt in $(seq 1 30); do url=$(aws ssm get-parameter --name ${cfg.parameterPrefix}/host/bundle-url --query Parameter.Value --output text) && break; sleep 10; done`,
			"dir=$(mktemp -d)",
			'aws s3 cp "$url" "$dir/host.zip" --only-show-errors',
			'python3 -m zipfile -e "$dir/host.zip" "$dir/host"',
			'bash "$dir/host/bootstrap.sh" "$url"',
			'rm -rf "$dir"',
		];
		const userData = ec2.UserData.custom(
			(cfg.verifyHostBundleInUserData
				? verifiedBundleUserData
				: unverifiedBundleUserData
			).join("\n"),
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

		const alertAction = new cwActions.SnsAction(alertTopic);
		const recoveryAlarm = new cloudwatch.Alarm(this, "SystemStatusRecovery", {
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
		});
		recoveryAlarm.addAlarmAction(
			new cwActions.Ec2Action(cwActions.Ec2InstanceAction.RECOVER),
			alertAction,
		);
		recoveryAlarm.addOkAction(alertAction);

		const instanceStatusAlarm = new cloudwatch.Alarm(
			this,
			"InstanceStatusAlarm",
			{
				alarmName: "inbound-gateway-host-instance-status",
				alarmDescription:
					"The gateway host fails its instance status check (OS unreachable: kernel, memory, network). Reboot it from the console or with aws ec2 reboot-instances.",
				metric: new cloudwatch.Metric({
					namespace: "AWS/EC2",
					metricName: "StatusCheckFailed_Instance",
					dimensionsMap: { InstanceId: instance.instanceId },
					statistic: cloudwatch.Stats.MAXIMUM,
					period: Duration.minutes(1),
				}),
				evaluationPeriods: 3,
				threshold: 1,
				comparisonOperator:
					cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				treatMissingData: cloudwatch.TreatMissingData.MISSING,
			},
		);
		instanceStatusAlarm.addAlarmAction(alertAction);
		instanceStatusAlarm.addOkAction(alertAction);

		const cpuCreditAlarm = new cloudwatch.Alarm(this, "CpuCreditAlarm", {
			alarmName: "inbound-gateway-host-cpu-credits-low",
			alarmDescription:
				"The gateway host has used up its CPU credits (sustained high CPU: load, a flood or a runaway process). It keeps running at full speed and is billed for surplus credits.",
			metric: new cloudwatch.Metric({
				namespace: "AWS/EC2",
				metricName: "CPUCreditBalance",
				dimensionsMap: { InstanceId: instance.instanceId },
				statistic: cloudwatch.Stats.MINIMUM,
				period: Duration.minutes(5),
			}),
			evaluationPeriods: 3,
			threshold: 20,
			comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
			treatMissingData: cloudwatch.TreatMissingData.MISSING,
		});
		cpuCreditAlarm.addAlarmAction(alertAction);
		cpuCreditAlarm.addOkAction(alertAction);

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
			// Only the deploy workflow file, from main, in this repository (immutable IDs), in the
			// production environment.
			assumedBy: new iam.OpenIdConnectPrincipal(githubOidc, {
				StringEquals: {
					"token.actions.githubusercontent.com:sub": cfg.githubSubject,
					"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
					"token.actions.githubusercontent.com:repository_id":
						cfg.githubRepositoryId,
					"token.actions.githubusercontent.com:repository_owner_id":
						cfg.githubRepositoryOwnerId,
					"token.actions.githubusercontent.com:ref": cfg.githubDeployRef,
					"token.actions.githubusercontent.com:job_workflow_ref": `${cfg.githubDeployWorkflow}@${cfg.githubDeployRef}`,
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
				conditions: {
					StringEquals: { "aws:RequestedRegion": this.region },
				},
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
		new CfnOutput(this, "AlertTopicArn", { value: alertTopic.topicArn });
		new CfnOutput(this, "SessionLogGroupName", {
			value: sessionLogGroup.logGroupName,
		});

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
