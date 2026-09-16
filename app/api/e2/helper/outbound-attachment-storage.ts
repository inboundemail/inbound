import { createHash } from "node:crypto";
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

export const MAX_OUTBOUND_ATTACHMENT_SIZE = 25 * 1024 * 1024;
export const OUTBOUND_ATTACHMENT_TTL_SECONDS = 60 * 60;
export const OUTBOUND_UPLOAD_URL_TTL_SECONDS = 15 * 60;

const ATTACHMENT_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

function getStorageConfig() {
	const bucket = process.env.S3_BUCKET_NAME;
	if (!bucket) {
		throw new Error("Attachment storage is not configured");
	}

	const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
	const credentials =
		accessKeyId && secretAccessKey
			? { accessKeyId, secretAccessKey }
			: undefined;

	return {
		bucket,
		client: new S3Client({
			region: process.env.AWS_REGION || "us-east-2",
			credentials,
		}),
	};
}

function tenantPath(userId: string): string {
	return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

function objectKey(userId: string, attachmentId: string): string {
	if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) {
		throw new Error("Invalid attachment_id");
	}

	return `outbound-attachments/${tenantPath(userId)}/${attachmentId}`;
}

function validateMetadata(
	filename: string,
	contentType: string,
	size: number,
): void {
	if (
		!filename.trim() ||
		filename.length > 255 ||
		/[\r\n\0"\\]/.test(filename)
	) {
		throw new Error("filename must be between 1 and 255 safe characters");
	}
	if (
		!contentType.trim() ||
		contentType.length > 255 ||
		/[\r\n\0]/.test(contentType)
	) {
		throw new Error("content_type must be a valid MIME type");
	}
	if (
		!Number.isSafeInteger(size) ||
		size <= 0 ||
		size > MAX_OUTBOUND_ATTACHMENT_SIZE
	) {
		throw new Error(
			`size must be an integer between 1 and ${MAX_OUTBOUND_ATTACHMENT_SIZE} bytes`,
		);
	}
}

function encodeMetadata(value: string): string {
	return Buffer.from(value, "utf8").toString("base64url");
}

function decodeMetadata(value: string | undefined, field: string): string {
	if (!value)
		throw new Error(`Uploaded attachment is missing ${field} metadata`);
	try {
		return Buffer.from(value, "base64url").toString("utf8");
	} catch {
		throw new Error(`Uploaded attachment has invalid ${field} metadata`);
	}
}

export async function createOutboundAttachmentUpload(input: {
	userId: string;
	filename: string;
	contentType: string;
	size: number;
}) {
	validateMetadata(input.filename, input.contentType, input.size);
	const { bucket, client } = getStorageConfig();
	const attachmentId = nanoid();
	const key = objectKey(input.userId, attachmentId);
	const expiresAt = new Date(
		Date.now() + OUTBOUND_ATTACHMENT_TTL_SECONDS * 1000,
	);
	const uploadExpiresAt = new Date(
		Date.now() + OUTBOUND_UPLOAD_URL_TTL_SECONDS * 1000,
	);
	const metadata = {
		filename: encodeMetadata(input.filename),
		"content-type": encodeMetadata(input.contentType),
		"expected-size": input.size.toString(),
		"expires-at": expiresAt.toISOString(),
	};
	const uploadUrl = await getSignedUrl(
		client,
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			ContentLength: input.size,
			ContentType: input.contentType,
			Metadata: metadata,
		}),
		{
			expiresIn: OUTBOUND_UPLOAD_URL_TTL_SECONDS,
			unhoistableHeaders: new Set([
				"x-amz-meta-filename",
				"x-amz-meta-content-type",
				"x-amz-meta-expected-size",
				"x-amz-meta-expires-at",
			]),
		},
	);

	return {
		attachmentId,
		uploadUrl,
		expiresAt,
		uploadExpiresAt,
		headers: {
			"Content-Type": input.contentType,
			"x-amz-meta-filename": metadata.filename,
			"x-amz-meta-content-type": metadata["content-type"],
			"x-amz-meta-expected-size": metadata["expected-size"],
			"x-amz-meta-expires-at": metadata["expires-at"],
		},
	};
}

export async function readOutboundAttachment(
	userId: string,
	attachmentId: string,
): Promise<{
	content: string;
	filename: string;
	contentType: string;
	size: number;
}> {
	const { bucket, client } = getStorageConfig();
	const key = objectKey(userId, attachmentId);
	let head;
	try {
		head = await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: key }),
		);
	} catch {
		throw new Error("Uploaded attachment was not found");
	}
	const filename = decodeMetadata(head.Metadata?.filename, "filename");
	const contentType = decodeMetadata(
		head.Metadata?.["content-type"],
		"content_type",
	);
	const expectedSize = Number(head.Metadata?.["expected-size"]);
	const expiresAt = Date.parse(head.Metadata?.["expires-at"] || "");

	validateMetadata(filename, contentType, expectedSize);
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
		await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
		throw new Error("Uploaded attachment has expired");
	}
	if (
		head.ContentLength !== expectedSize ||
		head.ContentLength > MAX_OUTBOUND_ATTACHMENT_SIZE
	) {
		throw new Error(
			"Uploaded attachment size does not match the declared size",
		);
	}
	if (head.ContentType !== contentType) {
		throw new Error(
			"Uploaded attachment content type does not match the declared type",
		);
	}

	let object;
	try {
		object = await client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);
	} catch {
		throw new Error("Uploaded attachment content is unavailable");
	}
	if (!object.Body)
		throw new Error("Uploaded attachment content is unavailable");
	const bytes = await object.Body.transformToByteArray();
	if (bytes.byteLength !== expectedSize) {
		throw new Error("Uploaded attachment size changed while it was being read");
	}
	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

	return {
		content: Buffer.from(bytes).toString("base64"),
		filename,
		contentType,
		size: bytes.byteLength,
	};
}

export async function cleanupExpiredOutboundAttachments(): Promise<number> {
	const { bucket, client } = getStorageConfig();
	let continuationToken: string | undefined;
	let deleted = 0;

	do {
		const page = await client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: "outbound-attachments/",
				ContinuationToken: continuationToken,
			}),
		);
		const expiredKeys: string[] = [];
		const objects = page.Contents || [];
		for (let index = 0; index < objects.length; index += 25) {
			const batch = objects.slice(index, index + 25);
			const results = await Promise.all(
				batch.map(async (object) => {
					if (!object.Key) return null;
					try {
						const head = await client.send(
							new HeadObjectCommand({ Bucket: bucket, Key: object.Key }),
						);
						const expiresAt = Date.parse(head.Metadata?.["expires-at"] || "");
						const staleWithoutMetadata =
							!Number.isFinite(expiresAt) &&
							!!object.LastModified &&
							object.LastModified.getTime() <
								Date.now() - OUTBOUND_ATTACHMENT_TTL_SECONDS * 2 * 1000;
						return expiresAt <= Date.now() || staleWithoutMetadata
							? object.Key
							: null;
					} catch {
						return null;
					}
				}),
			);
			expiredKeys.push(...results.filter((key): key is string => !!key));
		}

		if (expiredKeys.length > 0) {
			await client.send(
				new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: { Objects: expiredKeys.map((Key) => ({ Key })) },
				}),
			);
			deleted += expiredKeys.length;
		}
		continuationToken = page.NextContinuationToken;
	} while (continuationToken);

	return deleted;
}
