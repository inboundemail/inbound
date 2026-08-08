import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
	buildSnsSignaturePayload,
	isExpectedSnsTopic,
	isTrustedSnsUrl,
	type SnsNotification,
	verifySnsNotification,
} from "@/app/api/inbound/health/tenant/sns-verification";

const region = "us-east-2";
const accountId = "123456789012";

function buildNotification(): SnsNotification {
	return {
		Type: "Notification",
		MessageId: "sns-message-id",
		TopicArn: `arn:aws:sns:${region}:${accountId}:ses-tenant-example-events`,
		Message: '{"eventType":"Open"}',
		Timestamp: "2026-08-08T19:20:00.000Z",
		SignatureVersion: "2",
		Signature: "",
		SigningCertURL: `https://sns.${region}.amazonaws.com/SimpleNotificationService-test.pem`,
	};
}

describe("SNS verification", () => {
	it("builds the canonical notification payload", () => {
		expect(buildSnsSignaturePayload(buildNotification())).toBe(
			"Message\n" +
				'{"eventType":"Open"}\n' +
				"MessageId\n" +
				"sns-message-id\n" +
				"Timestamp\n" +
				"2026-08-08T19:20:00.000Z\n" +
				"TopicArn\n" +
				`arn:aws:sns:${region}:${accountId}:ses-tenant-example-events\n` +
				"Type\n" +
				"Notification\n",
		);
	});

	it("accepts a valid AWS SNS signature", async () => {
		const { privateKey, publicKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
		});
		const notification = buildNotification();
		const signer = createSign("RSA-SHA256");
		signer.update(buildSnsSignaturePayload(notification), "utf8");
		signer.end();
		notification.Signature = signer.sign(privateKey, "base64");

		const valid = await verifySnsNotification(notification, {
			region,
			accountId,
			getCertificate: async () =>
				publicKey.export({ type: "spki", format: "pem" }).toString(),
		});

		expect(valid).toBe(true);
	});

	it("rejects untrusted URLs and unrelated topics", async () => {
		expect(isTrustedSnsUrl("https://example.com/cert.pem", region)).toBe(false);
		expect(
			isExpectedSnsTopic(
				`arn:aws:sns:${region}:${accountId}:other-topic`,
				region,
				accountId,
			),
		).toBe(false);
		expect(
			await verifySnsNotification(
				{
					...buildNotification(),
					SigningCertURL: "https://example.com/cert.pem",
				},
				{
					region,
					accountId,
					getCertificate: async () => "unused",
				},
			),
		).toBe(false);
	});
});
