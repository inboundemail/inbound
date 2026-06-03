/**
 * API Response Types
 *
 * Consolidated types extracted from v2 API routes for use in frontend hooks.
 * These types define the request/response shapes for API endpoints.
 */

import type { guardRules } from "@/lib/db/schema";

// =============================================================================
// DOMAINS
// =============================================================================

export interface GetDomainsRequest {
	limit?: number;
	offset?: number;
	status?: "pending" | "verified" | "failed";
	canReceive?: "true" | "false";
	check?: "true" | "false";
}

export interface DomainWithStats {
	id: string;
	domain: string;
	status: string;
	canReceiveEmails: boolean;
	hasMxRecords: boolean;
	domainProvider: string | null;
	providerConfidence: string | null;
	lastDnsCheck: Date | null;
	lastSesCheck: Date | null;
	isCatchAllEnabled: boolean;
	catchAllEndpointId: string | null;
	mailFromDomain: string | null;
	mailFromDomainStatus: string | null;
	mailFromDomainVerifiedAt: Date | null;
	receiveDmarcEmails: boolean;
	createdAt: Date;
	updatedAt: Date;
	userId: string;
	stats: {
		totalEmailAddresses: number;
		activeEmailAddresses: number;
		hasCatchAll: boolean;
	};
	catchAllEndpoint?: {
		id: string;
		name: string;
		type: string;
		isActive: boolean;
	} | null;
	verificationCheck?: {
		dnsRecords?: Array<{
			type: string;
			name: string;
			value: string;
			isVerified: boolean;
			error?: string;
		}>;
		sesStatus?: string;
		isFullyVerified?: boolean;
		lastChecked?: Date;
	};
}

export interface GetDomainByIdResponse {
	id: string;
	domain: string;
	status: string;
	canReceiveEmails: boolean;
	hasMxRecords: boolean;
	domainProvider: string | null;
	providerConfidence: string | null;
	lastDnsCheck: Date | null;
	lastSesCheck: Date | null;
	isCatchAllEnabled: boolean;
	catchAllEndpointId: string | null;
	mailFromDomain: string | null;
	mailFromDomainStatus: string | null;
	mailFromDomainVerifiedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	userId: string;
	stats: {
		totalEmailAddresses: number;
		activeEmailAddresses: number;
		emailsLast24h: number;
		emailsLast7d: number;
		emailsLast30d: number;
	};
	catchAllEndpoint?: {
		id: string;
		name: string;
		type: string;
		isActive: boolean;
	} | null;
	verificationCheck?: {
		dnsRecords?: Array<{
			type: string;
			name: string;
			value: string;
			isVerified: boolean;
			error?: string;
		}>;
		sesStatus?: string;
		dkimStatus?: string;
		dkimVerified?: boolean;
		dkimTokens?: string[];
		mailFromDomain?: string;
		mailFromStatus?: string;
		mailFromVerified?: boolean;
		isFullyVerified?: boolean;
		lastChecked?: Date;
	};
	authRecommendations?: {
		spf?: { name: string; value: string; description: string };
		dmarc?: { name: string; value: string; description: string };
	};
}

export interface PutDomainByIdRequest {
	isCatchAllEnabled: boolean;
	catchAllEndpointId?: string | null;
}

// =============================================================================
// EMAIL ADDRESSES
// =============================================================================

export interface GetEmailAddressesRequest {
	limit?: number;
	offset?: number;
	domainId?: string;
	isActive?: "true" | "false";
	isReceiptRuleConfigured?: "true" | "false";
}

export interface EmailAddressWithDomain {
	id: string;
	address: string;
	domainId: string;
	webhookId: string | null;
	endpointId: string | null;
	isActive: boolean;
	isReceiptRuleConfigured: boolean;
	receiptRuleName: string | null;
	createdAt: Date;
	updatedAt: Date;
	userId: string;
	domain: {
		id: string;
		name: string;
		status: string;
	};
	routing: {
		type: "webhook" | "endpoint" | "none";
		id: string | null;
		name: string | null;
		config?: unknown;
		isActive: boolean;
		endpointType?: "webhook" | "email" | "email_group";
	};
}

export interface GetEmailAddressesResponse {
	data: EmailAddressWithDomain[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
}

export interface PostEmailAddressesRequest {
	address: string;
	domainId: string;
	endpointId?: string;
	webhookId?: string;
	isActive?: boolean;
}

export interface PostEmailAddressesResponse {
	id: string;
	address: string;
	domainId: string;
	webhookId: string | null;
	endpointId: string | null;
	isActive: boolean;
	isReceiptRuleConfigured: boolean;
	receiptRuleName: string | null;
	createdAt: Date;
	updatedAt: Date;
	userId: string;
	domain: {
		id: string;
		name: string;
		status: string;
	};
	routing: {
		type: "webhook" | "endpoint" | "none";
		id: string | null;
		name: string | null;
		config?: unknown;
		isActive: boolean;
	};
	warning?: string;
}

export interface GetEmailAddressByIdResponse {
	id: string;
	address: string;
	domainId: string;
	webhookId: string | null;
	endpointId: string | null;
	isActive: boolean;
	isReceiptRuleConfigured: boolean;
	receiptRuleName: string | null;
	createdAt: Date;
	updatedAt: Date;
	userId: string;
	domain: {
		id: string;
		name: string;
		status: string;
	};
	routing: {
		type: "webhook" | "endpoint" | "none";
		id: string | null;
		name: string | null;
		config?: unknown;
		isActive: boolean;
	};
}

export interface PutEmailAddressByIdRequest {
	endpointId?: string | null;
	webhookId?: string | null;
	isActive?: boolean;
}

export interface PutEmailAddressByIdResponse {
	id: string;
	address: string;
	domainId: string;
	webhookId: string | null;
	endpointId: string | null;
	isActive: boolean;
	isReceiptRuleConfigured: boolean;
	receiptRuleName: string | null;
	createdAt: Date;
	updatedAt: Date;
	userId: string;
	domain: {
		id: string;
		name: string;
		status: string;
	};
	routing: {
		type: "webhook" | "endpoint" | "none";
		id: string | null;
		name: string | null;
		config?: unknown;
		isActive: boolean;
	};
	warning?: string;
}

export interface DeleteEmailAddressByIdResponse {
	message: string;
	cleanup: {
		sesRuleUpdated: boolean;
		emailAddress: string;
		domain: string;
		warning?: string;
	};
}

// =============================================================================
// EMAILS
// =============================================================================

export interface GetEmailByIdResponse {
	object: "email";
	id: string;
	to: string[];
	from: string;
	created_at: string;
	subject: string;
	html: string | null;
	text: string | null;
	bcc: (string | null)[];
	cc: (string | null)[];
	reply_to: (string | null)[];
	last_event: string;
	email_type: "inbound" | "outbound" | "scheduled";
}

export interface PostRetryDeliveryRequest {
	deliveryId: string;
}

export interface PostRetryDeliveryResponse {
	success: boolean;
	message: string;
	deliveryId?: string;
	error?: string;
}

// =============================================================================
// MAIL
// =============================================================================

export interface GetMailRequest {
	limit?: number;
	offset?: number;
	search?: string;
	status?: "all" | "processed" | "failed";
	domain?: string;
	timeRange?: "24h" | "7d" | "30d" | "90d";
	includeArchived?: boolean;
	emailAddress?: string;
	emailId?: string;
}

export interface EmailItem {
	id: string;
	emailId: string;
	messageId: string | null;
	subject: string;
	from: string;
	fromName: string | null;
	recipient: string;
	preview: string;
	receivedAt: Date;
	isRead: boolean;
	readAt: Date | null;
	isArchived: boolean;
	archivedAt: Date | null;
	hasAttachments: boolean;
	attachmentCount: number;
	parseSuccess: boolean | null;
	parseError: string | null;
	createdAt: Date;
}

export interface GetMailResponse {
	emails: EmailItem[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
	filters: {
		uniqueDomains: string[];
	};
}

export interface ParsedEmailAddress {
	text: string;
	addresses: Array<{
		name: string | null;
		address: string | null;
	}>;
}

export interface EmailAttachment {
	filename: string | undefined;
	contentType: string | undefined;
	size: number | undefined;
	contentId: string | undefined;
	contentDisposition: string | undefined;
}

export interface GetMailByIdResponse {
	id: string;
	emailId: string;
	messageId: string | null;
	subject: string | null;
	from: string;
	fromName: string | null;
	to: string;
	cc: string | null;
	bcc: string | null;
	replyTo: string | null;
	recipient: string;
	recipientName: string | null;
	receivedAt: Date | null;
	isRead: boolean;
	readAt: Date | null;
	content: {
		textBody: string | null;
		htmlBody: string | null;
		rawContent: string | null;
		attachments: EmailAttachment[];
		headers: Record<string, unknown>;
	};
	addresses: {
		from: ParsedEmailAddress | null;
		to: ParsedEmailAddress | null;
		cc: ParsedEmailAddress | null;
		bcc: ParsedEmailAddress | null;
		replyTo: ParsedEmailAddress | null;
	};
	metadata: {
		inReplyTo: string | null;
		references: string[];
		priority: string | null;
		parseSuccess: boolean | null;
		parseError: string | null;
		hasAttachments: boolean;
		attachmentCount: number;
		hasTextBody: boolean;
		hasHtmlBody: boolean;
	};
	security: {
		spf: string;
		dkim: string;
		dmarc: string;
		spam: string;
		virus: string;
	};
	processing: {
		processingTimeMs: number | null;
		timestamp: Date | null;
		receiptTimestamp: Date | null;
		actionType: string | null;
		s3Info: {
			bucketName: string | null;
			objectKey: string | null;
			contentFetched: boolean | null;
			contentSize: number | null;
			error: string | null;
		};
		commonHeaders: Record<string, unknown> | null;
	};
	createdAt: Date | null;
	updatedAt: Date | null;
}

export interface PatchMailRequest {
	isRead?: boolean;
	isArchived?: boolean;
}

export interface PatchMailResponse {
	id: string;
	isRead: boolean;
	isArchived: boolean;
	readAt: Date | null;
	archivedAt: Date | null;
}

export interface PostMailBulkRequest {
	emailIds: string[];
	updates: {
		isRead?: boolean;
		isArchived?: boolean;
	};
}

export interface PostMailBulkResponse {
	updatedCount: number;
	emails: Array<{
		id: string;
		isRead: boolean;
		isArchived: boolean;
	}>;
}

// =============================================================================
// MAIL THREADS
// =============================================================================

export interface ThreadMessage {
	id: string;
	messageId: string | null;
	type: "inbound" | "outbound";
	subject: string | null;
	from: string;
	fromName: string | null;
	to: string;
	receivedAt: Date | null;
	sentAt: Date | null;
	content: {
		textBody: string | null;
		htmlBody: string | null;
		attachments: Array<{
			filename?: string;
			contentType?: string;
			size?: number;
			contentId?: string;
			contentDisposition?: string;
		}>;
	};
	addresses: {
		from: {
			text: string;
			addresses: Array<{
				name: string | null;
				address: string | null;
			}>;
		} | null;
		to: {
			text: string;
			addresses: Array<{
				name: string | null;
				address: string | null;
			}>;
		} | null;
	};
	metadata: {
		inReplyTo: string | null;
		references: string[];
		parseSuccess: boolean | null;
		parseError: string | null;
	};
	isRead: boolean;
	readAt: Date | null;
}

export interface GetThreadResponse {
	messages: ThreadMessage[];
	totalCount: number;
	threadId: string;
}

// =============================================================================
// GUARD RULES
// =============================================================================

export interface GetGuardRulesResponse {
	success: true;
	data: Array<typeof guardRules.$inferSelect>;
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
}

export type GetGuardRuleResponse = typeof guardRules.$inferSelect;
export type UpdateGuardRuleResponse = typeof guardRules.$inferSelect;

export interface DeleteGuardRuleResponse {
	success: boolean;
}

// =============================================================================
// OUTBOUND EMAILS (SENDING)
// =============================================================================

export interface AttachmentInput {
	filename: string;
	content: string; // Base64 encoded
	contentType?: string;
	content_type?: string;
	content_id?: string;
}

export interface PostEmailsRequest {
	from: string;
	to: string | string[];
	subject: string;
	bcc?: string | string[];
	cc?: string | string[];
	reply_to?: string | string[]; // snake_case (legacy)
	replyTo?: string | string[]; // camelCase (Resend-compatible)
	html?: string;
	text?: string;
	headers?: Record<string, string>;
	attachments?: AttachmentInput[];
	tags?: Array<{
		name: string;
		value: string;
	}>;
	scheduled_at?: string; // ISO 8601 or natural language
	timezone?: string; // User's timezone for natural language parsing
}

export interface PostEmailsResponse {
	id: string;
	messageId: string; // AWS SES Message ID
}
