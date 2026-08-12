import { eq, or, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { parseOpenEvent } from "@/app/api/inbound/health/tenant/open-event";
import {
	isTrustedSnsUrl,
	type SnsNotification,
	verifySnsNotification,
} from "@/app/api/inbound/health/tenant/sns-verification";
import { suspendTenantSending } from "@/lib/aws-ses/aws-ses-tenants";
import { db } from "@/lib/db";
import { sentEmails } from "@/lib/db/schema";
import { getTenantOwnerByConfigurationSet } from "@/lib/db/tenants";
import { sendReputationAlertNotification } from "@/lib/email-management/email-notifications";
import { sendHarkNotification } from "@/lib/notifications/hark";
import { getSesConfigurationSetName } from "@/lib/ses-monitoring/configuration-set";
import { shouldTrackSesReputationEvent } from "@/lib/ses-monitoring/event-filter";
import {
	checkRateThresholds,
	getTenantRates,
	processSESEvent,
	type RateAlert,
} from "@/lib/ses-monitoring/rate-tracker";

// Slack webhook for admin notifications
const SLACK_ADMIN_WEBHOOK_URL = process.env.SLACK_ADMIN_WEBHOOK_URL;
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

// CloudWatch Alarm notification format
interface CloudWatchAlarmMessage {
	AlarmName: string;
	AlarmDescription: string;
	AWSAccountId: string;
	Region: string;
	NewStateValue: "ALARM" | "OK" | "INSUFFICIENT_DATA";
	NewStateReason: string;
	StateChangeTime: string;
	MetricName: string;
	Namespace: string;
	Statistic: string;
	Dimensions: Array<{
		name: string;
		value: string;
	}>;
	Period: number;
	EvaluationPeriods: number;
	ComparisonOperator: string;
	Threshold: number;
	TreatMissingData: string;
	EvaluatedDatapoints: Array<{
		timestamp: string;
		sampleCount: number;
		value: number;
	}>;
}

// SES Event notification format
interface SESEvent {
	eventType:
		| "send"
		| "reject"
		| "bounce"
		| "complaint"
		| "delivery"
		| "open";
	mail: {
		timestamp: string;
		messageId: string;
		source: string;
		sourceArn: string;
		sourceIp: string;
		sendingAccountId: string;
		callerIdentity: string;
		configurationSetName?: string;
		tags?: {
			[key: string]: string[];
		};
		commonHeaders: {
			from: string[];
			to: string[];
			messageId: string;
			subject: string;
		};
		destination: string[];
	};
	bounce?: {
		bounceType: "Undetermined" | "Permanent" | "Transient";
		bounceSubType: string;
		bouncedRecipients: Array<{
			emailAddress: string;
			action: string;
			status: string;
			diagnosticCode: string;
		}>;
		timestamp: string;
		feedbackId: string;
		reportingMTA: string;
	};
	complaint?: {
		complainedRecipients: Array<{
			emailAddress: string;
		}>;
		complaintSubType?: string | null;
		timestamp: string;
		feedbackId: string;
		userAgent: string;
		complaintFeedbackType: string;
		arrivalDate: string;
	};
	open?: {
		timestamp: string;
		ipAddress?: string;
		userAgent?: string;
	};
}

interface SESEventMessage {
	Records: SESEvent[];
}

export async function POST(request: NextRequest) {
	try {
		console.log(
			"🚨 POST /api/inbound/health/tenant - Received SNS notification",
		);

		// Get the request body
		const body = (await request.json()) as SnsNotification;

		if (!AWS_ACCOUNT_ID) {
			console.error("AWS_ACCOUNT_ID is required for SNS verification");
			return NextResponse.json(
				{ status: "error", message: "SNS verification is not configured" },
				{ status: 500 },
			);
		}

		const verified = await verifySnsNotification(body, {
			region: AWS_REGION,
			accountId: AWS_ACCOUNT_ID,
		});
		if (!verified) {
			return NextResponse.json(
				{ status: "error", message: "Invalid SNS notification" },
				{ status: 401 },
			);
		}

		// Parse the SNS notification
		const parsedNotification = parseSNSNotification(body);

		if (parsedNotification.messageType === "SubscriptionConfirmation") {
			console.log(
				"✅ SubscriptionConfirmation received for tenant health monitoring",
			);
			console.log("   Topic ARN:", parsedNotification.topicArn);
			console.log("   Subscribe URL:", body.SubscribeURL);

			// Automatically confirm the subscription by making a GET request to the SubscribeURL
			if (body.SubscribeURL && isTrustedSnsUrl(body.SubscribeURL, AWS_REGION)) {
				try {
					console.log("🔄 Auto-confirming SNS subscription...");
					const confirmResponse = await fetch(body.SubscribeURL);

					if (confirmResponse.ok) {
						console.log("✅ SNS subscription confirmed successfully!");
						return NextResponse.json({
							status: "healthy",
							timestamp: new Date().toISOString(),
							message: "Subscription confirmed successfully",
							topicArn: parsedNotification.topicArn,
						});
					} else {
						console.error(
							"❌ Failed to confirm subscription:",
							confirmResponse.status,
							confirmResponse.statusText,
						);
						return NextResponse.json(
							{
								status: "error",
								timestamp: new Date().toISOString(),
								message: "Failed to confirm subscription",
								error: `HTTP ${confirmResponse.status}: ${confirmResponse.statusText}`,
							},
							{ status: 500 },
						);
					}
				} catch (confirmError) {
					console.error("❌ Error confirming subscription:", confirmError);
					return NextResponse.json(
						{
							status: "error",
							timestamp: new Date().toISOString(),
							message: "Error confirming subscription",
							error:
								confirmError instanceof Error
									? confirmError.message
									: "Unknown error",
						},
						{ status: 500 },
					);
				}
			}

			return NextResponse.json(
				{
					status: "error",
					timestamp: new Date().toISOString(),
					message: "No SubscribeURL provided in confirmation request",
				},
				{ status: 400 },
			);
		}

		// Log the notification
		console.log("=== AWS SNS Tenant Health Notification ===");
		console.log("Timestamp:", new Date().toISOString());
		console.log("SNS Message Type:", parsedNotification.messageType);
		console.log("Topic ARN:", parsedNotification.topicArn);

		// Handle CloudWatch Alarms
		if (parsedNotification.cloudWatchAlarm) {
			console.log("--- CloudWatch Alarm Details ---");
			const alarm = parsedNotification.cloudWatchAlarm;
			console.log("Alarm Name:", alarm.AlarmName);
			console.log("State:", alarm.NewStateValue);
			console.log("Metric:", alarm.MetricName);
			console.log("Threshold:", alarm.Threshold);

			if (alarm.NewStateValue === "ALARM") {
				await handleCloudWatchAlarm(alarm);
			} else {
				console.log("⏭️ Ignoring non-ALARM state:", alarm.NewStateValue);
			}
		}

		// Handle SES Events - Process bounces and complaints for rate tracking
		if (parsedNotification.sesEvents) {
			console.log("--- SES Events Details ---");
			console.log(
				`Received ${parsedNotification.sesEvents.Records.length} SES event(s)`,
			);

			for (const event of parsedNotification.sesEvents.Records) {
				console.log(`Event Type: ${event.eventType}`);
				console.log(
					`Configuration Set: ${event.mail.configurationSetName || "N/A"}`,
				);
				console.log(`Message ID: ${event.mail.messageId}`);

				if (event.eventType === "open") {
					await handleSESOpen(event);
					continue;
				}

				if (!shouldTrackSesReputationEvent(event)) {
					console.log(
						"Skipping suppression-list complaint for reputation tracking",
					);
					continue;
				}

				// Process bounce and complaint events for rate tracking
				if (
					(event.eventType === "bounce" || event.eventType === "complaint") &&
					event.mail.configurationSetName
				) {
					await handleSESBounceOrComplaint(event);
				}
			}
		}

		// Log raw data for debugging (limit size for large payloads)
		const rawDataPreview = JSON.stringify(
			parsedNotification,
			null,
			2,
		).substring(0, 1000);
		console.log("--- Raw SNS Data Preview ---");
		console.log(
			rawDataPreview + (rawDataPreview.length >= 1000 ? "...[truncated]" : ""),
		);

		// Return success response
		return NextResponse.json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			message: "Tenant health notification processed successfully",
			messageType: parsedNotification.messageType,
			hasCloudWatchAlarm: !!parsedNotification.cloudWatchAlarm,
			hasSESEvents: !!parsedNotification.sesEvents,
			eventsProcessed: parsedNotification.sesEvents?.Records.length || 0,
		});
	} catch (error) {
		console.error("❌ Error processing tenant health notification:", error);

		return NextResponse.json(
			{
				status: "error",
				timestamp: new Date().toISOString(),
				message: "Tenant health notification processing failed",
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

function parseSNSNotification(snsData: SnsNotification) {
	const result = {
		messageType: snsData.Type,
		messageId: snsData.MessageId,
		topicArn: snsData.TopicArn,
		timestamp: snsData.Timestamp,
		cloudWatchAlarm: null as CloudWatchAlarmMessage | null,
		sesEvents: null as SESEventMessage | null,
	};

	// Parse the Message field if it's a Notification
	if (snsData.Type === "Notification" && snsData.Message) {
		try {
			const parsedMessage = JSON.parse(snsData.Message);

			// Check if it's a CloudWatch Alarm
			if (parsedMessage.AlarmName && parsedMessage.MetricName) {
				result.cloudWatchAlarm = parsedMessage as CloudWatchAlarmMessage;
			}
			// Check if it's SES Events wrapped in Records[] (SES v1 / receiving pipeline)
			else if (parsedMessage.Records && Array.isArray(parsedMessage.Records)) {
				result.sesEvents = parsedMessage as SESEventMessage;
			}
			// Handle flat SES v2 event format (Configuration Set event destinations via SNS)
			// SES v2 sends events as flat objects with eventType + mail at the top level —
			// wrap them in Records[] so downstream handlers work unchanged.
			else if (parsedMessage.eventType && parsedMessage.mail) {
				const configurationSetName = getSesConfigurationSetName(
					parsedMessage.mail,
				);
				// SES v2 sends eventType capitalized ("Bounce", "Complaint", "Delivery", ...)
				// but downstream code compares against lowercase values. Normalize here.
				const normalizedEvent = {
					...parsedMessage,
					eventType:
						typeof parsedMessage.eventType === "string"
							? parsedMessage.eventType.toLowerCase()
							: parsedMessage.eventType,
					mail: {
						...parsedMessage.mail,
						configurationSetName,
					},
				};
				console.log(
					`📨 parseSNSNotification - Flat SES v2 event detected: ${normalizedEvent.eventType} (raw: ${parsedMessage.eventType})`,
				);
				result.sesEvents = {
					Records: [normalizedEvent],
				} as SESEventMessage;
			} else {
				console.log("🤔 Unknown message format:", Object.keys(parsedMessage));
			}
		} catch (error) {
			console.error("❌ Failed to parse SNS Message field:", error);
		}
	}

	return result;
}

async function handleSESOpen(event: SESEvent): Promise<void> {
	const openEvent = parseOpenEvent(event);
	if (!openEvent) {
		return;
	}

	const messageIdMatch = or(
		eq(sentEmails.sesMessageId, openEvent.sesMessageId),
		eq(sentEmails.messageId, openEvent.sesMessageId),
	);
	const lookupCondition = openEvent.sentEmailId
		? eq(sentEmails.id, openEvent.sentEmailId)
		: messageIdMatch;

	const [sentEmail] = await db
		.select({ id: sentEmails.id })
		.from(sentEmails)
		.where(lookupCondition)
		.limit(1);

	if (!sentEmail) {
		console.warn(
			`No sent email found for SES open event ${openEvent.sesMessageId}`,
		);
		return;
	}

	await db
		.update(sentEmails)
		.set({
			firstOpenedAt: sql`LEAST(COALESCE(${sentEmails.firstOpenedAt}, ${openEvent.openedAt}), ${openEvent.openedAt})`,
			lastOpenedAt: sql`GREATEST(COALESCE(${sentEmails.lastOpenedAt}, ${openEvent.openedAt}), ${openEvent.openedAt})`,
			updatedAt: new Date(),
		})
		.where(eq(sentEmails.id, sentEmail.id));
}

async function handleCloudWatchAlarm(alarm: CloudWatchAlarmMessage) {
	try {
		console.log(
			`🚨 handleCloudWatchAlarm - Processing alarm: ${alarm.AlarmName}`,
		);

		// Extract configuration set from dimensions
		const configSetDimension = alarm.Dimensions.find(
			(d) => d.name === "ConfigurationSet",
		);
		if (!configSetDimension) {
			console.log("⚠️ No ConfigurationSet dimension found in alarm");
			return;
		}

		const configurationSet = configSetDimension.value;
		console.log(`🔍 Configuration Set: ${configurationSet}`);

		// Look up tenant and user information
		const tenantOwner =
			await getTenantOwnerByConfigurationSet(configurationSet);
		if (!tenantOwner) {
			console.log(
				`❌ No tenant owner found for configuration set: ${configurationSet}`,
			);
			return;
		}

		console.log(
			`✅ Found tenant owner: ${tenantOwner.userEmail} (${tenantOwner.tenantName})`,
		);

		// Determine alert type and severity from alarm name and metric
		const alertInfo = parseAlarmInfo(alarm);
		if (!alertInfo) {
			console.log("⚠️ Could not parse alert information from alarm");
			return;
		}

		console.log(
			`📊 Alert Info: ${alertInfo.alertType} ${alertInfo.severity} (${alertInfo.currentRate})`,
		);

		// Format rate for display
		const rateDisplay =
			alertInfo.alertType !== "delivery_delay"
				? `${(alertInfo.currentRate * 100).toFixed(2)}%`
				: `${alertInfo.currentRate.toFixed(0)} delayed`;

		// Send Slack notification to admin for ALL alerts
		await sendAdminAlert({
			alertType: alertInfo.alertType,
			severity: alertInfo.severity,
			currentRate: rateDisplay,
			threshold:
				alertInfo.alertType !== "delivery_delay"
					? `${(alarm.Threshold * 100).toFixed(2)}%`
					: `${alarm.Threshold}`,
			configurationSet,
			tenantName: tenantOwner.tenantName,
			userEmail: tenantOwner.userEmail,
			triggeredAt: new Date(alarm.StateChangeTime),
		});

		// Auto-suspend sending on CRITICAL alerts, only when the 24h database
		// window confirms the rate with sufficient send volume
		let sendingSuspended = false;
		if (tenantOwner.tenantStatus === "suspended") {
			sendingSuspended = true;
		}
		const dbConfirmation =
			alertInfo.severity === "critical"
				? await confirmSuspendWithDbRates(configurationSet, alertInfo.alertType)
				: null;
		if (dbConfirmation && !dbConfirmation.shouldSuspend) {
			console.log(
				`⏭️ CRITICAL alarm but suspend skipped for ${configurationSet}: ${dbConfirmation.reason}`,
			);
		}
		if (
			dbConfirmation?.shouldSuspend &&
			tenantOwner.tenantStatus === "suspended"
		) {
			console.log(
				`⏭️ CRITICAL alarm but tenant is already suspended: ${configurationSet}`,
			);
		}
		if (
			dbConfirmation?.shouldSuspend &&
			tenantOwner.tenantStatus !== "suspended"
		) {
			console.log(
				`🚨 CRITICAL alert - Auto-suspending sending for: ${configurationSet} (${dbConfirmation.reason})`,
			);

			const suspendResult = await suspendTenantSending(
				configurationSet,
				`Auto-suspended due to critical ${alertInfo.alertType} rate: ${rateDisplay} (24h confirmed: ${dbConfirmation.reason})`,
			);

			if (suspendResult.success) {
				sendingSuspended = true;
				console.log(
					`✅ Sending suspended for configuration set: ${configurationSet}`,
				);

				// Send additional Slack notification about auto-suspend
				await sendAdminAlert({
					alertType: alertInfo.alertType,
					severity: "critical",
					currentRate: rateDisplay,
					threshold:
						alertInfo.alertType !== "delivery_delay"
							? `${(alarm.Threshold * 100).toFixed(2)}%`
							: `${alarm.Threshold}`,
					configurationSet,
					tenantName: tenantOwner.tenantName,
					userEmail: tenantOwner.userEmail,
					triggeredAt: new Date(alarm.StateChangeTime),
					action: "SENDING_SUSPENDED",
				});
			} else {
				console.error(`❌ Failed to suspend sending: ${suspendResult.error}`);
			}
		}

		// Send notification email to user
		const emailResult = await sendReputationAlertNotification({
			userEmail: tenantOwner.userEmail,
			userName: tenantOwner.userName,
			alertType: alertInfo.alertType,
			severity: alertInfo.severity,
			currentRate: alertInfo.currentRate,
			threshold: alarm.Threshold,
			configurationSet: configurationSet,
			tenantName: tenantOwner.tenantName,
			triggeredAt: new Date(alarm.StateChangeTime),
			sendingPaused: sendingSuspended,
		});

		if (emailResult.success) {
			console.log(`✅ handleCloudWatchAlarm - Alert email sent successfully`);
			console.log(`   📧 Email sent to: ${tenantOwner.userEmail}`);
			console.log(`   📧 Message ID: ${emailResult.messageId}`);
		} else {
			console.error(`❌ handleCloudWatchAlarm - Failed to send alert email`);
			console.error(`   Error: ${emailResult.error}`);
		}
	} catch (error) {
		console.error("❌ handleCloudWatchAlarm - Unexpected error:", error);
	}
}

/**
 * Send Slack notification to admin about reputation alerts
 */
async function sendSlackAdminNotification(data: {
	alertType: "bounce" | "complaint" | "delivery_delay";
	severity: "warning" | "critical";
	currentRate: string;
	threshold: string;
	configurationSet: string;
	tenantName: string;
	userEmail: string;
	triggeredAt: Date;
	action?: "SENDING_SUSPENDED";
}) {
	if (!SLACK_ADMIN_WEBHOOK_URL) {
		console.log(
			"⚠️ SLACK_ADMIN_WEBHOOK_URL not configured, skipping Slack notification",
		);
		return;
	}

	try {
		const emoji = data.severity === "critical" ? "🚨" : "⚠️";
		const alertTypeDisplay =
			data.alertType === "bounce"
				? "Bounce Rate"
				: data.alertType === "complaint"
					? "Complaint Rate"
					: "Delivery Delay";

		const actionText =
			data.action === "SENDING_SUSPENDED"
				? "\n\n🛑 *ACTION TAKEN: Sending has been automatically suspended for this tenant*"
				: "";

		const slackMessage = {
			blocks: [
				{
					type: "header",
					text: {
						type: "plain_text",
						text: `${emoji} SES ${data.severity.toUpperCase()} Alert: ${alertTypeDisplay}`,
						emoji: true,
					},
				},
				{
					type: "section",
					fields: [
						{
							type: "mrkdwn",
							text: `*Tenant:*\n${data.tenantName}`,
						},
						{
							type: "mrkdwn",
							text: `*User:*\n${data.userEmail}`,
						},
						{
							type: "mrkdwn",
							text: `*Current Rate:*\n${data.currentRate}`,
						},
						{
							type: "mrkdwn",
							text: `*Threshold:*\n${data.threshold}`,
						},
						{
							type: "mrkdwn",
							text: `*Config Set:*\n\`${data.configurationSet}\``,
						},
						{
							type: "mrkdwn",
							text: `*Triggered:*\n${data.triggeredAt.toLocaleString()}`,
						},
					],
				},
				...(actionText
					? [
							{
								type: "section",
								text: {
									type: "mrkdwn",
									text: actionText,
								},
							},
						]
					: []),
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `View in <https://inbound.new/admin/tenants|Admin Dashboard>`,
						},
					],
				},
			],
		};

		const response = await fetch(SLACK_ADMIN_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(slackMessage),
		});

		if (!response.ok) {
			console.error(
				`❌ Slack notification failed: ${response.status} ${response.statusText}`,
			);
		} else {
			console.log(
				`✅ Slack admin notification sent for ${data.configurationSet}`,
			);
		}
	} catch (error) {
		console.error("❌ Failed to send Slack notification:", error);
	}
}

interface ReputationAlertData {
	alertType: "bounce" | "complaint" | "delivery_delay";
	severity: "warning" | "critical";
	currentRate: string;
	threshold: string;
	configurationSet: string;
	tenantName: string;
	userEmail: string;
	triggeredAt: Date;
	action?: "SENDING_SUSPENDED";
}

/**
 * Send a Hark push notification to admins about a reputation alert.
 *
 * The idempotency key is derived from the alarm identity and its trigger time,
 * so SNS redelivering the same alarm collapses into one notification. The
 * suspension follow-up carries a distinct key so it is never swallowed.
 */
async function sendHarkAdminNotification(data: ReputationAlertData) {
	const alertTypeDisplay =
		data.alertType === "bounce"
			? "Bounce rate"
			: data.alertType === "complaint"
				? "Complaint rate"
				: "Delivery delay";

	const suspended = data.action === "SENDING_SUSPENDED";
	const emoji = suspended ? "🛑" : data.severity === "critical" ? "🚨" : "⚠️";

	const headline = suspended
		? `${emoji} Sending suspended: ${data.tenantName}`
		: `${emoji} SES ${data.severity} — ${alertTypeDisplay}`;

	const body = [
		headline,
		`${alertTypeDisplay} ${data.currentRate} (threshold ${data.threshold})`,
		`Tenant ${data.tenantName} · ${data.userEmail}`,
	].join("\n");

	await sendHarkNotification({
		title: "inbound",
		body,
		url: "https://inbound.new/admin/tenants",
		idempotencyKey: [
			"ses-reputation",
			data.configurationSet,
			data.alertType,
			data.severity,
			suspended ? "suspended" : "alert",
			data.triggeredAt.toISOString(),
		].join(":"),
	});
}

/**
 * Fan a reputation alert out to every admin channel.
 *
 * Channels are independent: a Slack outage must not suppress the phone push,
 * and neither may throw into the SNS handler, which would make AWS retry the
 * whole delivery.
 */
async function sendAdminAlert(data: ReputationAlertData) {
	const results = await Promise.allSettled([
		sendSlackAdminNotification(data),
		sendHarkAdminNotification(data),
	]);

	for (const result of results) {
		if (result.status === "rejected") {
			console.error("❌ Admin alert channel failed:", result.reason);
		}
	}
}

/**
 * Map AWS SES bounce types to our schema values
 * AWS sends: 'Permanent' | 'Transient' | 'Undetermined'
 * Schema expects: 'hard' | 'soft' | 'transient'
 */
function mapSESBounceType(
	sesBounceType: "Permanent" | "Transient" | "Undetermined",
): "hard" | "soft" | "transient" {
	switch (sesBounceType) {
		case "Permanent":
			return "hard";
		case "Transient":
			return "transient";
		case "Undetermined":
		default:
			return "soft";
	}
}

/**
 * Handle SES bounce or complaint events
 * Stores the event and triggers alerts if rate thresholds are exceeded
 */
async function handleSESBounceOrComplaint(event: SESEvent) {
	try {
		const configSetName = event.mail.configurationSetName;
		if (!configSetName) {
			console.log(
				"⚠️ handleSESBounceOrComplaint - No configuration set name in event",
			);
			return;
		}

		console.log(
			`📊 handleSESBounceOrComplaint - Processing ${event.eventType} for ${configSetName}`,
		);

		// Get recipients from bounce or complaint
		let recipients: string[] = [];
		let bounceType: "hard" | "soft" | "transient" | undefined;
		let bounceSubType: string | undefined;
		let diagnosticCode: string | undefined;

		if (event.eventType === "bounce" && event.bounce) {
			recipients = event.bounce.bouncedRecipients.map((r) => r.emailAddress);
			bounceType = mapSESBounceType(event.bounce.bounceType);
			bounceSubType = event.bounce.bounceSubType;
			diagnosticCode = event.bounce.bouncedRecipients[0]?.diagnosticCode;
		} else if (event.eventType === "complaint" && event.complaint) {
			recipients = event.complaint.complainedRecipients.map(
				(r) => r.emailAddress,
			);
		}

		// Process each recipient
		for (const recipient of recipients) {
			const result = await processSESEvent({
				eventType: event.eventType as "bounce" | "complaint",
				configurationSetName: configSetName,
				messageId: event.mail.messageId,
				recipient,
				bounceType,
				bounceSubType,
				diagnosticCode,
				timestamp: new Date(event.mail.timestamp),
			});

			// Handle any alerts triggered by this event
			if (result.alerts.length > 0) {
				for (const alert of result.alerts) {
					await handleRateAlert(alert, configSetName);
				}
			}
		}

		console.log(
			`✅ handleSESBounceOrComplaint - Processed ${event.eventType} for ${recipients.length} recipient(s)`,
		);
	} catch (error) {
		console.error(
			"❌ handleSESBounceOrComplaint - Error processing event:",
			error,
		);
	}
}

/**
 * Confirm a CloudWatch critical alarm against the 24h database window before
 * auto-suspending. CloudWatch computes rates over short windows, so a single
 * bounce on a low-volume tenant can look critical; this applies the same
 * volume floors and thresholds the DB rate tracker uses.
 */
async function confirmSuspendWithDbRates(
	configurationSet: string,
	alertType: "bounce" | "complaint" | "delivery_delay",
): Promise<{ shouldSuspend: boolean; reason: string }> {
	if (alertType === "delivery_delay") {
		return {
			shouldSuspend: true,
			reason: "delivery_delay alerts are not volume-gated",
		};
	}

	const rates = await getTenantRates(configurationSet);
	if (!rates) {
		return {
			shouldSuspend: false,
			reason: "could not compute 24h rates; alerting without enforcement",
		};
	}

	const rate = alertType === "bounce" ? rates.bounceRate : rates.complaintRate;
	const events =
		alertType === "bounce" ? rates.totalBounces : rates.totalComplaints;
	const criticalAlert = checkRateThresholds(rates).find(
		(alert) =>
			alert.alertType === alertType && alert.severity === "critical",
	);

	if (!criticalAlert) {
		return {
			shouldSuspend: false,
			reason: `24h ${alertType} metrics did not meet critical rate, volume, and event-count gates (${events}/${rates.totalSends}, ${(rate * 100).toFixed(2)}%)`,
		};
	}
	return {
		shouldSuspend: true,
		reason: `24h ${alertType} rate ${(rate * 100).toFixed(2)}% >= ${(criticalAlert.threshold * 100).toFixed(2)}% over ${rates.totalSends} recipient attempts`,
	};
}

/**
 * Handle a rate alert - send notifications and potentially suspend sending
 */
async function handleRateAlert(alert: RateAlert, configSetName: string) {
	try {
		console.log(
			`🚨 handleRateAlert - ${alert.severity.toUpperCase()} ${alert.alertType} alert for ${configSetName}`,
		);

		// Look up tenant owner
		const tenantOwner = await getTenantOwnerByConfigurationSet(configSetName);
		if (!tenantOwner) {
			console.log(
				`❌ handleRateAlert - No tenant owner found for: ${configSetName}`,
			);
			return;
		}

		const rateDisplay = `${(alert.currentRate * 100).toFixed(2)}%`;
		const thresholdDisplay = `${(alert.threshold * 100).toFixed(2)}%`;
		if (alert.severity === "critical" && tenantOwner.tenantStatus === "suspended") {
			console.log(
				"⏭️ handleRateAlert - Tenant already suspended; skipping repeat enforcement",
			);
			return;
		}

		// Send Slack notification
		await sendAdminAlert({
			alertType: alert.alertType,
			severity: alert.severity,
			currentRate: rateDisplay,
			threshold: thresholdDisplay,
			configurationSet: configSetName,
			tenantName: tenantOwner.tenantName,
			userEmail: tenantOwner.userEmail,
			triggeredAt: new Date(),
		});

		// Auto-suspend sending on CRITICAL alerts
		let sendingSuspended = false;
		if (alert.severity === "critical") {
			console.log(
				`🚨 handleRateAlert - CRITICAL alert - Auto-suspending sending for: ${configSetName}`,
			);

			const suspendResult = await suspendTenantSending(
				configSetName,
				`Auto-suspended due to critical ${alert.alertType} rate: ${rateDisplay}`,
			);

			if (suspendResult.success) {
				sendingSuspended = true;
				console.log(
					`✅ handleRateAlert - Sending suspended for: ${configSetName}`,
				);

				// Send additional Slack notification about auto-suspend
				await sendAdminAlert({
					alertType: alert.alertType,
					severity: "critical",
					currentRate: rateDisplay,
					threshold: thresholdDisplay,
					configurationSet: configSetName,
					tenantName: tenantOwner.tenantName,
					userEmail: tenantOwner.userEmail,
					triggeredAt: new Date(),
					action: "SENDING_SUSPENDED",
				});
			} else {
				console.error(
					`❌ handleRateAlert - Failed to suspend sending: ${suspendResult.error}`,
				);
			}
		}

		// Send notification email to user
		const emailResult = await sendReputationAlertNotification({
			userEmail: tenantOwner.userEmail,
			userName: tenantOwner.userName,
			alertType: alert.alertType,
			severity: alert.severity,
			currentRate: alert.currentRate,
			threshold: alert.threshold,
			configurationSet: configSetName,
			tenantName: tenantOwner.tenantName,
			triggeredAt: new Date(),
			sendingPaused: sendingSuspended,
		});

		if (emailResult.success) {
			console.log(
				`✅ handleRateAlert - Alert email sent to: ${tenantOwner.userEmail}`,
			);
		} else {
			console.error(
				`❌ handleRateAlert - Failed to send alert email: ${emailResult.error}`,
			);
		}
	} catch (error) {
		console.error("❌ handleRateAlert - Error handling alert:", error);
	}
}

function parseAlarmInfo(alarm: CloudWatchAlarmMessage): {
	alertType: "bounce" | "complaint" | "delivery_delay";
	severity: "warning" | "critical";
	currentRate: number;
} | null {
	try {
		// Get the most recent datapoint value
		const latestDatapoint = alarm.EvaluatedDatapoints.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		)[0];

		if (!latestDatapoint) {
			console.log("⚠️ No evaluated datapoints found in alarm");
			return null;
		}

		const currentRate = latestDatapoint.value;

		// Parse alert type from metric name
		let alertType: "bounce" | "complaint" | "delivery_delay";
		if (alarm.MetricName === "Reputation.BounceRate") {
			alertType = "bounce";
		} else if (alarm.MetricName === "Reputation.ComplaintRate") {
			alertType = "complaint";
		} else if (alarm.MetricName === "Send") {
			alertType = "delivery_delay";
		} else {
			console.log(`⚠️ Unknown metric name: ${alarm.MetricName}`);
			return null;
		}

		// Parse severity from alarm name or threshold
		let severity: "warning" | "critical";
		const alarmNameLower = alarm.AlarmName.toLowerCase();
		if (
			alarmNameLower.includes("critical") ||
			alarmNameLower.includes("7%") ||
			alarmNameLower.includes("2.5%") ||
			alarmNameLower.includes("0.3%") ||
			alarmNameLower.includes("0.1%")
		) {
			severity = "critical";
		} else {
			severity = "warning";
		}

		return {
			alertType,
			severity,
			currentRate,
		};
	} catch (error) {
		console.error("❌ parseAlarmInfo - Error parsing alarm info:", error);
		return null;
	}
}

// Optional: Add GET method for basic health checks
export async function GET() {
	console.log("GET request to /api/inbound/health/tenant:", {
		timestamp: new Date().toISOString(),
		message: "Tenant health check via GET",
	});

	return NextResponse.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		message: "Tenant health check successful (GET)",
		service: "SES Tenant Reputation Monitoring",
	});
}
