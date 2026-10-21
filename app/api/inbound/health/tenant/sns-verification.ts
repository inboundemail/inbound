import { createVerify } from "node:crypto";

export interface SnsNotification {
	Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
	MessageId: string;
	TopicArn: string;
	Message: string;
	Timestamp: string;
	SignatureVersion: string;
	Signature: string;
	SigningCertURL: string;
	Subject?: string;
	UnsubscribeURL?: string;
	SubscribeURL?: string;
	Token?: string;
}

interface VerifySnsOptions {
	region: string;
	accountId: string;
	allowedTopicArns?: readonly string[];
	getCertificate?: (url: string) => Promise<string>;
}

const certificateCache = new Map<string, string>();
const MAX_CACHED_CERTIFICATES = 20;
const SIGNING_CERT_PATH = /^\/SimpleNotificationService-[0-9a-f]+\.pem$/;

export function isTrustedSnsSigningCertUrl(
	value: string,
	region: string,
): boolean {
	if (!isTrustedSnsUrl(value, region)) return false;
	try {
		const url = new URL(value);
		return (
			SIGNING_CERT_PATH.test(url.pathname) &&
			url.search === "" &&
			url.hash === "" &&
			url.port === "" &&
			url.username === "" &&
			url.password === ""
		);
	} catch {
		return false;
	}
}

export function isTrustedSnsUrl(value: string, region: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			url.hostname === `sns.${region}.amazonaws.com`
		);
	} catch {
		return false;
	}
}

export function isExpectedSnsTopic(
	topicArn: string,
	region: string,
	accountId: string,
): boolean {
	const [arn, partition, service, topicRegion, topicAccountId, topicName] =
		topicArn.split(":");
	return (
		arn === "arn" &&
		partition === "aws" &&
		service === "sns" &&
		topicRegion === region &&
		topicAccountId === accountId &&
		topicName.startsWith("ses-") &&
		(topicName.endsWith("-events") || topicName.endsWith("-alerts"))
	);
}

export function buildSnsSignaturePayload(message: SnsNotification): string {
	const fields: Array<[string, string | undefined]> =
		message.Type === "Notification"
			? [
					["Message", message.Message],
					["MessageId", message.MessageId],
					["Subject", message.Subject],
					["Timestamp", message.Timestamp],
					["TopicArn", message.TopicArn],
					["Type", message.Type],
				]
			: [
					["Message", message.Message],
					["MessageId", message.MessageId],
					["SubscribeURL", message.SubscribeURL],
					["Timestamp", message.Timestamp],
					["Token", message.Token],
					["TopicArn", message.TopicArn],
					["Type", message.Type],
				];

	return fields
		.filter((field): field is [string, string] => field[1] !== undefined)
		.map(([name, value]) => `${name}\n${value}\n`)
		.join("");
}

async function fetchCertificate(url: string): Promise<string> {
	const cached = certificateCache.get(url);
	if (cached) {
		return cached;
	}

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to retrieve SNS signing certificate: ${response.status}`);
	}

	const certificate = await response.text();
	while (certificateCache.size >= MAX_CACHED_CERTIFICATES) {
		const oldest = certificateCache.keys().next();
		if (oldest.done) break;
		certificateCache.delete(oldest.value);
	}
	certificateCache.set(url, certificate);
	return certificate;
}

export async function verifySnsNotification(
	message: SnsNotification,
	options: VerifySnsOptions,
): Promise<boolean> {
	if (typeof message.TopicArn !== "string") {
		return false;
	}

	const topicAllowed = options.allowedTopicArns
		? options.allowedTopicArns.includes(message.TopicArn)
		: isExpectedSnsTopic(message.TopicArn, options.region, options.accountId);

	if (
		typeof message.SigningCertURL !== "string" ||
		!isTrustedSnsSigningCertUrl(message.SigningCertURL, options.region) ||
		!topicAllowed
	) {
		return false;
	}

	const algorithm =
		message.SignatureVersion === "1"
			? "RSA-SHA1"
			: message.SignatureVersion === "2"
				? "RSA-SHA256"
				: null;
	if (!algorithm) {
		return false;
	}

	try {
		const certificate = await (
			options.getCertificate || fetchCertificate
		)(message.SigningCertURL);
		const verifier = createVerify(algorithm);
		verifier.update(buildSnsSignaturePayload(message), "utf8");
		verifier.end();
		return verifier.verify(certificate, message.Signature, "base64");
	} catch {
		return false;
	}
}
