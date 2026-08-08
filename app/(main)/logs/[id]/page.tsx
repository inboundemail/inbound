import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import {
	structuredEmails,
	sentEmails,
	endpointDeliveries,
	endpoints,
	sesEvents,
} from "@/lib/db/schema";
import { and, eq, desc, asc } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Nucleo icons
import ShieldCheck from "@/components/icons/shield-check";
import ShieldAlert from "@/components/icons/shield-alert";
import Ban2 from "@/components/icons/ban-2";
import ArrowBoldLeft from "@/components/icons/arrow-bold-left";
import Envelope2 from "@/components/icons/envelope-2";
import CircleUser from "@/components/icons/circle-user";
import CircleCheck from "@/components/icons/circle-check";
import CircleXmark from "@/components/icons/circle-xmark";
import CircleWarning2 from "@/components/icons/circle-warning-2";

import { format } from "date-fns";

import type {
	GetMailByIdResponse,
	GetEmailByIdResponse,
} from "@/lib/api-types";

// Import the attachment list component
import { AttachmentList } from "@/components/logs/attachment-list";
import { ClickableId } from "@/components/logs/clickable-id";
import { ResendEmailDialog } from "@/components/logs/resend-email-dialog";
import { CodeBlock } from "@/components/ui/code-block";
import ArrowBoldRight from "@/components/icons/arrow-bold-right";
import FolderLink from "@/components/icons/folder-link";
import ChatBubble2 from "@/components/icons/chat-bubble-2";
import { CopyButton } from "@/components/copy-button";
import { CopyIdInline } from "@/components/logs/copy-id-inline";
import { ScrollPersistWrapper } from "@/components/logs/scroll-persist-wrapper";
import { ThreadList } from "@/components/logs/thread-list";

export default async function LogDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		redirect("/login");
	}

	const userId = session.user.id;

	// Determine if this ID corresponds to an inbound (structuredEmails) or outbound (sentEmails) record
	const [inbound] = await db
		.select({
			id: structuredEmails.id,
			threadId: structuredEmails.threadId,
		})
		.from(structuredEmails)
		.where(
			and(eq(structuredEmails.id, id), eq(structuredEmails.userId, userId)),
		)
		.limit(1);

	let type: "inbound" | "outbound" | null = null;
	let currentThreadId: string | null = null;

	if (inbound) {
		type = "inbound";
		currentThreadId = inbound.threadId;
	} else {
		const [outbound] = await db
			.select({
				id: sentEmails.id,
				threadId: sentEmails.threadId,
			})
			.from(sentEmails)
			.where(and(eq(sentEmails.id, id), eq(sentEmails.userId, userId)))
			.limit(1);
		if (outbound) {
			type = "outbound";
			currentThreadId = outbound.threadId;
		}
	}

	if (!type) {
		return (
			<div className="p-4">
				<div className="max-w-6xl mx-auto">
					<div className="flex items-center gap-4 mb-6">
						<Link href="/logs">
							<Button variant="primary">
								<ArrowBoldLeft className="h-4 w-4 mr-2" />
								Back to Logs
							</Button>
						</Link>
					</div>
					<Card className="border-destructive/50 bg-destructive/10 rounded-xl">
						<CardContent className="p-6">
							<div className="text-destructive">Log not found</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	// Fetch rich details based on type
	let inboundDetails:
		| (GetMailByIdResponse & {
				deliveries?: Array<any>;
				guardBlocked?: boolean;
				guardReason?: string | null;
				guardAction?: string | null;
				guardRuleId?: string | null;
				guardMetadata?: any;
		  })
		| null = null;
	let outboundDetails:
		| (GetEmailByIdResponse & {
				provider?: string;
				status?: string;
				failureReason?: string | null;
				providerResponse?: any;
		  })
		| null = null;

	if (type === "inbound") {
		// Get full inbound email details by reusing the same projection as the API
		const details = await db
			.select({
				// structured
				id: structuredEmails.id,
				emailId: structuredEmails.emailId,
				messageId: structuredEmails.messageId,
				subject: structuredEmails.subject,
				threadId: structuredEmails.threadId,
				fromData: structuredEmails.fromData,
				toData: structuredEmails.toData,
				ccData: structuredEmails.ccData,
				bccData: structuredEmails.bccData,
				replyToData: structuredEmails.replyToData,
				textBody: structuredEmails.textBody,
				htmlBody: structuredEmails.htmlBody,
				rawContent: structuredEmails.rawContent,
				attachments: structuredEmails.attachments,
				headers: structuredEmails.headers,
				priority: structuredEmails.priority,
				parseSuccess: structuredEmails.parseSuccess,
				parseError: structuredEmails.parseError,
				createdAt: structuredEmails.createdAt,
				updatedAt: structuredEmails.updatedAt,
				date: structuredEmails.date,
				readAt: structuredEmails.readAt,

				// Guard fields
				guardBlocked: structuredEmails.guardBlocked,
				guardReason: structuredEmails.guardReason,
				guardAction: structuredEmails.guardAction,
				guardRuleId: structuredEmails.guardRuleId,
				guardMetadata: structuredEmails.guardMetadata,

				// ses
				spamVerdict: sesEvents.spamVerdict,
				virusVerdict: sesEvents.virusVerdict,
				spfVerdict: sesEvents.spfVerdict,
				dkimVerdict: sesEvents.dkimVerdict,
				dmarcVerdict: sesEvents.dmarcVerdict,
				processingTimeMillis: sesEvents.processingTimeMillis,
				timestamp: sesEvents.timestamp,
				receiptTimestamp: sesEvents.receiptTimestamp,
				commonHeaders: sesEvents.commonHeaders,
			})
			.from(structuredEmails)
			.leftJoin(sesEvents, eq(structuredEmails.sesEventId, sesEvents.id))
			.where(
				and(eq(structuredEmails.id, id), eq(structuredEmails.userId, userId)),
			)
			.limit(1);

		if (details.length === 0) {
			redirect("/logs");
		}

		const row = details[0];
		const safeParse = (s: string | null) => {
			if (!s) return null;
			try {
				return JSON.parse(s);
			} catch {
				return null;
			}
		};

		const fromParsed = safeParse(row.fromData);
		const toParsed = safeParse(row.toData);
		const ccParsed = safeParse(row.ccData);
		const bccParsed = safeParse(row.bccData);
		const replyToParsed = safeParse(row.replyToData);
		const attachmentsParsed = safeParse(row.attachments) || [];
		const headersParsed = safeParse(row.headers) || {};
		const commonHeadersParsed = safeParse(row.commonHeaders);

		// Fetch deliveries for this inbound email (by emailId)
		const deliveriesRaw = await db
			.select({
				id: endpointDeliveries.id,
				status: endpointDeliveries.status,
				deliveryType: endpointDeliveries.deliveryType,
				attempts: endpointDeliveries.attempts,
				lastAttemptAt: endpointDeliveries.lastAttemptAt,
				responseData: endpointDeliveries.responseData,
				endpointId: endpointDeliveries.endpointId,
				endpointName: endpoints.name,
				endpointType: endpoints.type,
				endpointConfig: endpoints.config,
			})
			.from(endpointDeliveries)
			.leftJoin(endpoints, eq(endpointDeliveries.endpointId, endpoints.id))
			.where(eq(endpointDeliveries.emailId, row.emailId))
			.orderBy(desc(endpointDeliveries.lastAttemptAt));

		const deliveries = deliveriesRaw.map((d) => {
			let parsedResponse: any = null;
			let parsedConfig: any = null;
			try {
				parsedResponse = d.responseData
					? JSON.parse(d.responseData as unknown as string)
					: null;
			} catch {}
			try {
				parsedConfig = d.endpointConfig
					? JSON.parse(d.endpointConfig as unknown as string)
					: null;
			} catch {}
			return {
				id: d.id,
				type: d.deliveryType || "unknown",
				status: d.status || "unknown",
				attempts: d.attempts || 0,
				lastAttemptAt: d.lastAttemptAt?.toISOString() || null,
				responseData: parsedResponse,
				config: {
					name: d.endpointName || "Unknown Endpoint",
					type: d.endpointType || "unknown",
					config: parsedConfig,
					endpointId: d.endpointId, // Add the endpointId for the resend dialog
				},
			};
		});

		// Defensive check: emailId should never be null since it's NOT NULL in schema
		if (!row.emailId) {
			console.error(
				`[CRITICAL] Email ID missing for structured email ${row.id}. This indicates a data integrity issue.`,
			);
		}

		inboundDetails = {
			id: row.id,
			emailId: row.emailId, // receivedEmails.id reference
			messageId: row.messageId,
			subject: row.subject,
			from: fromParsed?.addresses?.[0]?.address || "unknown",
			fromName: fromParsed?.addresses?.[0]?.name || null,
			to: toParsed?.text || "",
			cc: ccParsed?.text || null,
			bcc: bccParsed?.text || null,
			replyTo: replyToParsed?.text || null,
			recipient: toParsed?.addresses?.[0]?.address || "unknown",
			recipientName: toParsed?.addresses?.[0]?.name || null,
			receivedAt: row.date || row.createdAt,
			isRead: true,
			readAt: row.readAt || row.createdAt,
			guardBlocked: row.guardBlocked || false,
			guardReason: row.guardReason,
			guardAction: row.guardAction,
			guardRuleId: row.guardRuleId,
			guardMetadata: row.guardMetadata ? JSON.parse(row.guardMetadata) : null,
			content: {
				textBody: row.textBody,
				htmlBody: row.htmlBody,
				rawContent: row.rawContent,
				attachments: attachmentsParsed,
				headers: headersParsed,
			},
			addresses: {
				from: fromParsed,
				to: toParsed,
				cc: ccParsed,
				bcc: bccParsed,
				replyTo: replyToParsed,
			},
			metadata: {
				inReplyTo: null,
				references: [],
				priority: row.priority,
				parseSuccess: row.parseSuccess,
				parseError: row.parseError,
				hasAttachments: attachmentsParsed.length > 0,
				attachmentCount: attachmentsParsed.length,
				hasTextBody: !!row.textBody,
				hasHtmlBody: !!row.htmlBody,
			},
			security: {
				spf: row.spfVerdict || "UNKNOWN",
				dkim: row.dkimVerdict || "UNKNOWN",
				dmarc: row.dmarcVerdict || "UNKNOWN",
				spam: row.spamVerdict || "UNKNOWN",
				virus: row.virusVerdict || "UNKNOWN",
			},
			processing: {
				processingTimeMs: row.processingTimeMillis,
				timestamp: row.timestamp,
				receiptTimestamp: row.receiptTimestamp,
				actionType: null,
				s3Info: {
					bucketName: null,
					objectKey: null,
					contentFetched: null,
					contentSize: null,
					error: null,
				},
				commonHeaders: commonHeadersParsed,
			},
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			deliveries,
		};
	} else {
		// Outbound details from DB (richer than the API-only shape)
		const details = await db
			.select({
				id: sentEmails.id,
				from: sentEmails.from,
				to: sentEmails.to,
				cc: sentEmails.cc,
				bcc: sentEmails.bcc,
				replyTo: sentEmails.replyTo,
				subject: sentEmails.subject,
				htmlBody: sentEmails.htmlBody,
				textBody: sentEmails.textBody,
				createdAt: sentEmails.createdAt,
				status: sentEmails.status,
				provider: sentEmails.provider,
				providerResponse: sentEmails.providerResponse,
				failureReason: sentEmails.failureReason,
				sentAt: sentEmails.sentAt,
				threadId: sentEmails.threadId,
			})
			.from(sentEmails)
			.where(and(eq(sentEmails.id, id), eq(sentEmails.userId, userId)))
			.limit(1);

		if (details.length === 0) {
			redirect("/logs");
		}

		const row = details[0];

		// Defensive check: id should never be null since it's the primary key
		if (!row.id) {
			console.error(
				`[CRITICAL] Sent email ID missing. This indicates a data integrity issue.`,
			);
		}

		const parseJSON = (s: string | null) => {
			try {
				return s ? JSON.parse(s) : [];
			} catch {
				return [];
			}
		};
		const to = parseJSON(row.to);
		const cc = parseJSON(row.cc);
		const bcc = parseJSON(row.bcc);
		const reply_to = parseJSON(row.replyTo);
		let providerResponse: any = null;
		try {
			providerResponse = row.providerResponse
				? JSON.parse(row.providerResponse)
				: null;
		} catch {}

		outboundDetails = {
			object: "email",
			email_type: "outbound",
			id: row.id,
			to,
			from: row.from,
			created_at: row.createdAt?.toISOString() || new Date().toISOString(),
			subject: row.subject || "No Subject",
			html: row.htmlBody,
			text: row.textBody,
			bcc: bcc.length ? bcc : [null],
			cc: cc.length ? cc : [null],
			reply_to: reply_to.length ? reply_to : [null],
			last_event: row.status === "sent" ? "delivered" : row.status || "created",
			provider: row.provider || undefined,
			status: row.status || undefined,
			failureReason: row.failureReason || null,
			providerResponse,
		};
	}

	const isInbound = type === "inbound";

	// Fetch all emails in the thread (excluding current email)
	let threadMembers: Array<{
		id: string;
		type: "inbound" | "outbound";
		order: number;
		from: string;
		to: string;
		timestamp: Date | null;
		isCurrent: boolean;
	}> = [];

	if (currentThreadId) {
		// Get inbound emails in thread
		const inboundThreadEmails = await db
			.select({
				id: structuredEmails.id,
				subject: structuredEmails.subject,
				createdAt: structuredEmails.createdAt,
				date: structuredEmails.date,
				threadPosition: structuredEmails.threadPosition,
				fromData: structuredEmails.fromData,
				toData: structuredEmails.toData,
			})
			.from(structuredEmails)
			.where(
				and(
					eq(structuredEmails.threadId, currentThreadId),
					eq(structuredEmails.userId, userId),
				),
			)
			.orderBy(asc(structuredEmails.threadPosition));

		// Get outbound emails in thread
		const outboundThreadEmails = await db
			.select({
				id: sentEmails.id,
				subject: sentEmails.subject,
				createdAt: sentEmails.createdAt,
				sentAt: sentEmails.sentAt,
				threadPosition: sentEmails.threadPosition,
				from: sentEmails.from,
				to: sentEmails.to,
			})
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.threadId, currentThreadId),
					eq(sentEmails.userId, userId),
				),
			)
			.orderBy(asc(sentEmails.threadPosition));

		// Combine and include current email; sort by threadPosition where available, fallback to time
		const combined = [
			...inboundThreadEmails.map((e) => {
				let fromText = "Unknown";
				let toText = "Unknown";
				try {
					const fromParsed = e.fromData
						? JSON.parse(e.fromData as unknown as string)
						: null;
					const toParsed = e.toData
						? JSON.parse(e.toData as unknown as string)
						: null;
					fromText =
						fromParsed?.text || fromParsed?.addresses?.[0]?.address || fromText;
					toText =
						toParsed?.text || toParsed?.addresses?.[0]?.address || toText;
				} catch {}
				return {
					id: e.id,
					type: "inbound" as const,
					order: e.threadPosition || 0,
					from: fromText,
					to: toText,
					timestamp: e.date || e.createdAt || null,
					isCurrent: e.id === id,
				};
			}),
			...outboundThreadEmails.map((e) => {
				let toAddresses: string[] = [];
				try {
					toAddresses = e.to ? JSON.parse(e.to as unknown as string) : [];
				} catch {}
				return {
					id: e.id,
					type: "outbound" as const,
					order: e.threadPosition || 0,
					from: e.from || "Unknown",
					to: toAddresses[0] || "Unknown",
					timestamp: e.sentAt || e.createdAt || null,
					isCurrent: e.id === id,
				};
			}),
		];

		threadMembers = combined
			.sort((a, b) => {
				if (a.order && b.order && a.order !== b.order) return a.order - b.order;
				const da = a.timestamp ? new Date(a.timestamp).getTime() : 0;
				const db = b.timestamp ? new Date(b.timestamp).getTime() : 0;
				return da - db;
			})
			.map((m, idx) => ({ ...m, order: m.order || idx + 1 }));
	}

	return (
		<ScrollPersistWrapper>
			<div className="p-4">
				<div className="max-w-6xl mx-auto">
					<div className="flex items-center gap-4 mb-6">
						<Link href="/logs">
							<Button variant="primary">
								<ArrowBoldLeft className="h-4 w-4 mr-2" />
								Back to Logs
							</Button>
						</Link>
					</div>

					<Card className="rounded-xl overflow-hidden mb-4">
						<CardContent className="p-6">
							{/* Subject Header */}
							<div className="flex items-center gap-2 mb-6">
								<h1 className="text-2xl font-semibold tracking-tight">
									{(isInbound
										? inboundDetails?.subject
										: outboundDetails?.subject) || "No Subject"}
								</h1>
							</div>

							{/* Email Flow - Simplified Card Layout */}
							<div className="flex items-stretch gap-3 overflow-x-auto">
								{/* From Card */}
								<div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 min-w-fit">
									<div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-100 border border-purple-300 flex-shrink-0">
										<CircleUser
											width="14"
											height="14"
											className="text-purple-600"
										/>
									</div>
									<div className="flex flex-col">
										<span className="text-xs font-medium text-purple-600 mb-0.5">
											From
										</span>
										<span className="text-sm font-semibold text-foreground">
											{(isInbound
												? inboundDetails?.from
												: outboundDetails?.from) || "unknown"}
										</span>
									</div>
								</div>

								{/* Arrow */}
								<div className="flex items-center flex-shrink-0">
									<ArrowBoldRight
										width="20"
										height="20"
										className="text-muted-foreground"
									/>
								</div>

								{/* To Card */}
								<div
									className={`flex items-center gap-3 rounded-lg px-4 py-3 min-w-fit border-2 ${
										isInbound
											? "bg-purple-500 border-purple-600"
											: "bg-blue-500 border-blue-600"
									}`}
								>
									<div
										className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
											isInbound ? "bg-purple-600" : "bg-blue-600"
										}`}
									>
										<Envelope2 width="14" height="14" className="text-white" />
									</div>
									<div className="flex flex-col">
										<span className="text-xs font-medium text-white/90 mb-0.5">
											To
										</span>
										<span className="text-sm font-semibold text-white">
											{isInbound
												? inboundDetails?.recipient
												: outboundDetails?.to?.[0] || "unknown"}
										</span>
									</div>
								</div>

								{/* Endpoint Card (for inbound with deliveries) */}
								{isInbound &&
									inboundDetails?.deliveries &&
									inboundDetails.deliveries.length > 0 && (
										<>
											{/* Arrow */}
											<div className="flex items-center flex-shrink-0">
												<ArrowBoldRight
													width="20"
													height="20"
													className="text-muted-foreground"
												/>
											</div>

											<div
												className={`flex items-center gap-3 rounded-lg px-4 py-3 min-w-fit border ${
													inboundDetails.deliveries[0]?.status === "success"
														? "bg-green-50 border-green-200"
														: inboundDetails.deliveries[0]?.status === "failed"
															? "bg-red-50 border-red-200"
															: "bg-yellow-50 border-yellow-200"
												}`}
											>
												<div
													className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
														inboundDetails.deliveries[0]?.status === "success"
															? "bg-green-100 border-green-300"
															: inboundDetails.deliveries[0]?.status ===
																	"failed"
																? "bg-red-100 border-red-300"
																: "bg-yellow-100 border-yellow-300"
													}`}
												>
													{inboundDetails.deliveries[0]?.status ===
													"success" ? (
														<CircleCheck
															width="14"
															height="14"
															className="text-green-600"
														/>
													) : inboundDetails.deliveries[0]?.status ===
														"failed" ? (
														<CircleXmark
															width="14"
															height="14"
															className="text-red-600"
														/>
													) : (
														<CircleWarning2
															width="14"
															height="14"
															className="text-yellow-600"
														/>
													)}
												</div>
												<div className="flex flex-col">
													<span
														className={`text-xs font-medium mb-0.5 ${
															inboundDetails.deliveries[0]?.status === "success"
																? "text-green-600"
																: inboundDetails.deliveries[0]?.status ===
																		"failed"
																	? "text-red-600"
																	: "text-yellow-600"
														}`}
													>
														{inboundDetails.deliveries[0]?.config?.name ||
															"Webhook"}
													</span>
													<span className="text-sm font-semibold text-foreground capitalize">
														{inboundDetails.deliveries[0]?.status || "pending"}
													</span>
												</div>
											</div>
										</>
									)}
							</div>
						</CardContent>
					</Card>

					{/* Thread Information Card */}
					{currentThreadId && threadMembers.length > 0 && (
						<Card className="rounded-xl overflow-hidden mb-4">
							<CardContent className="p-6">
								<div className="flex items-center justify-between mb-6">
									<div className="flex items-center gap-2">
										<ChatBubble2
											width="18"
											height="18"
											className="text-purple-600"
										/>
										<h3 className="text-sm font-semibold text-foreground">
											Thread Conversation
										</h3>
									</div>
									<Badge className="text-xs font-medium bg-purple-500/10 text-purple-600 border-purple-500/20">
										{threadMembers.length} message
										{threadMembers.length !== 1 ? "s" : ""}
									</Badge>
								</div>

								<ThreadList threadMembers={threadMembers} />
							</CardContent>
						</Card>
					)}

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						<div className="lg:col-span-2 space-y-4">
							{isInbound &&
								(inboundDetails?.guardBlocked ||
									inboundDetails?.guardAction) && (
									<Card className="rounded-xl overflow-hidden border-red-200 bg-red-50">
										<CardContent className="p-4 space-y-2">
											<div className="flex items-center gap-2 mb-2">
												<ShieldAlert className="h-4 w-4 text-destructive" />
												<h3 className="text-sm font-semibold text-destructive">
													Guard Summary
												</h3>
											</div>

											<div className="flex gap-4 text-sm">
												{inboundDetails.guardBlocked && (
													<div className="flex items-center gap-2">
														<span className="text-muted-foreground">
															Status:{" "}
															<b className="text-destructive">Blocked</b>
														</span>
													</div>
												)}
												{inboundDetails.guardAction !== "block" && (
													<div className="flex items-center gap-2">
														<span className="text-muted-foreground">
															Action:
														</span>
														<span className="font-medium capitalize">
															{inboundDetails.guardAction}
														</span>
													</div>
												)}
											</div>
											{inboundDetails.guardReason && (
												<Link
													href={`/guard/rules/${inboundDetails.guardRuleId}`}
													className="text-sm p-0"
												>
													<span className="text-sm text-blue-500 flex items-center gap-1 hover:underline">
														{inboundDetails.guardReason}
														<FolderLink className="h-4 w-4 text-blue-500" />
													</span>
												</Link>
											)}
											{inboundDetails.guardRuleId && (
												<div className="text-xs text-muted-foreground">
													Rule ID:{" "}
													<ClickableId id={inboundDetails.guardRuleId} />
												</div>
											)}
										</CardContent>
									</Card>
								)}
							<Card className="rounded-xl overflow-hidden">
								<CardContent className="p-6">
									<h3 className="text-sm font-semibold mb-3">Email Content</h3>
									<Tabs
										defaultValue={
											isInbound
												? inboundDetails?.content?.htmlBody
													? "html"
													: inboundDetails?.content?.textBody
														? "text"
														: "raw"
												: outboundDetails?.html
													? "html"
													: "text"
										}
										className="w-full"
									>
										<TabsList
											className={`grid w-full ${
												isInbound
													? `grid-cols-${
															[
																inboundDetails?.content?.htmlBody,
																inboundDetails?.content?.textBody,
																inboundDetails?.content?.rawContent,
															].filter(Boolean).length
														}`
													: `grid-cols-${
															[
																outboundDetails?.html,
																outboundDetails?.text,
															].filter(Boolean).length
														}`
											}`}
										>
											{(isInbound
												? inboundDetails?.content?.htmlBody
												: outboundDetails?.html) && (
												<TabsTrigger value="html">HTML</TabsTrigger>
											)}
											{(isInbound
												? inboundDetails?.content?.textBody
												: outboundDetails?.text) && (
												<TabsTrigger value="text">Text</TabsTrigger>
											)}
											{isInbound && inboundDetails?.content?.rawContent && (
												<TabsTrigger value="raw">Raw</TabsTrigger>
											)}
										</TabsList>
										{(isInbound
											? inboundDetails?.content?.htmlBody
											: outboundDetails?.html) && (
											<TabsContent value="html" className="space-y-2">
												<div className="border rounded-lg p-4 bg-muted/20 max-h-[640px] overflow-auto">
													<iframe
														srcDoc={`<html><head><link href=\"https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&display=swap\" rel=\"stylesheet\"><style>body{font-family:'Outfit',Arial,Helvetica,sans-serif;color:#000;background-color:transparent;margin:0;padding:16px;}*{font-family:'Outfit',Arial,Helvetica,sans-serif;font-weight:400;color:#000;}a{color:#2563eb !important;}</style></head><body>${isInbound ? inboundDetails?.content?.htmlBody || "" : outboundDetails?.html || ""}</body></html>`}
														className="w-full min-h-[300px] border-0"
														sandbox="allow-same-origin"
														title="Email HTML Content"
													/>
												</div>
											</TabsContent>
										)}
										{(isInbound
											? inboundDetails?.content?.textBody
											: outboundDetails?.text) && (
											<TabsContent value="text" className="space-y-2">
												<pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[640px] overflow-y-auto">
													{isInbound
														? inboundDetails?.content?.textBody
														: outboundDetails?.text}
												</pre>
											</TabsContent>
										)}
										{isInbound && inboundDetails?.content?.rawContent && (
											<TabsContent value="raw" className="space-y-2">
												<pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto font-mono max-h-[640px] overflow-y-auto">
													{inboundDetails?.content?.rawContent}
												</pre>
											</TabsContent>
										)}
									</Tabs>
								</CardContent>
							</Card>

							{isInbound && inboundDetails?.deliveries && (
								<Card className="rounded-xl overflow-hidden">
									<CardContent className="p-6">
										<div className="flex items-center justify-between mb-3">
											<h3 className="text-sm font-semibold">
												Delivery Information
											</h3>
											{inboundDetails.deliveries.length > 0 && (
												<ResendEmailDialog
													emailId={inboundDetails.id}
													defaultEndpointId={
														inboundDetails.deliveries[0]?.config?.endpointId
													}
													deliveries={inboundDetails.deliveries}
												/>
											)}
										</div>
										{inboundDetails.deliveries.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												No delivery configured for this email
											</p>
										) : (
											<div className="divide-y divide-border rounded-lg border">
												{inboundDetails.deliveries.map(
													(delivery: any, idx: number) => (
														<div key={delivery.id} className="p-4">
															<div className="flex items-start justify-between">
																<div>
																	<h4 className="font-medium text-foreground">
																		{delivery.config?.name ||
																			"Unknown Endpoint"}
																	</h4>
																	<p className="text-sm text-muted-foreground">
																		{delivery.type === "webhook"
																			? "Webhook"
																			: "Email Forward"}
																	</p>
																</div>
																<div className="flex items-center gap-2">
																	<Badge
																		variant={
																			delivery.status === "success"
																				? "default"
																				: delivery.status === "failed"
																					? "destructive"
																					: "secondary"
																		}
																		className={
																			delivery.status === "success"
																				? "bg-green-500/10 text-green-600 border-green-500/20"
																				: delivery.status === "failed"
																					? ""
																					: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
																		}
																	>
																		{String(delivery.status).toUpperCase()}
																	</Badge>
																</div>
															</div>
															<div className="mt-3 grid grid-cols-2 gap-4 text-sm">
																<div>
																	<span className="text-muted-foreground">
																		Attempts:
																	</span>
																	<p className="font-medium">
																		{delivery.attempts}
																	</p>
																</div>
																{delivery.lastAttemptAt && (
																	<div>
																		<span className="text-muted-foreground">
																			Last Attempt:
																		</span>
																		<p className="font-medium">
																			{format(
																				new Date(delivery.lastAttemptAt),
																				"PPp",
																			)}
																		</p>
																	</div>
																)}
															</div>
															{delivery.responseData && (
																<div className="mt-3">
																	<div className="text-muted-foreground text-xs mb-1">
																		Response Data:
																	</div>
																	<CodeBlock
																		code={JSON.stringify(
																			delivery.responseData,
																			null,
																			2,
																		)}
																		size="sm"
																		variant="default"
																	/>
																</div>
															)}
														</div>
													),
												)}
											</div>
										)}
									</CardContent>
								</Card>
							)}

							{!isInbound && (
								<Card className="rounded-xl overflow-hidden">
									<CardContent className="p-6">
										<h3 className="text-sm font-semibold mb-3">
											Sending Details
										</h3>
										<div className="space-y-2 text-sm">
											<div className="grid grid-cols-2 gap-4">
												<div>
													<span className="text-muted-foreground">Status:</span>
													<p className="font-medium capitalize">
														{outboundDetails?.status}
													</p>
												</div>
												<div>
													<span className="text-muted-foreground">
														Provider:
													</span>
													<p className="font-medium uppercase">
														{outboundDetails?.provider}
													</p>
												</div>
											</div>
											{outboundDetails?.failureReason && (
												<div className="p-3 bg-destructive/10 rounded-lg text-destructive">
													{outboundDetails.failureReason}
												</div>
											)}
											{outboundDetails?.providerResponse && (
												<div>
													<div className="text-muted-foreground text-xs mb-1">
														Provider Response:
													</div>
													<pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
														{JSON.stringify(
															outboundDetails.providerResponse,
															null,
															2,
														)}
													</pre>
												</div>
											)}
										</div>
									</CardContent>
								</Card>
							)}
						</div>

						<div className="space-y-4">
							<Card className="rounded-xl overflow-hidden">
								<CardContent className="p-6">
									<h3 className="text-sm font-semibold mb-3">
										Email Identifiers
									</h3>
									<div className="space-y-4 text-sm">
										<div>
											<span className="text-muted-foreground">Record ID:</span>
											<div className="mt-1">
												{isInbound ? (
													inboundDetails?.emailId ? (
														<ClickableId id={inboundDetails.emailId} />
													) : (
														<span className="text-destructive text-xs">
															Data integrity error - missing emailId
														</span>
													)
												) : outboundDetails?.id ? (
													<ClickableId id={outboundDetails.id} />
												) : (
													<span className="text-destructive text-xs">
														Data integrity error - missing id
													</span>
												)}
											</div>
										</div>
										{isInbound &&
											inboundDetails?.emailId &&
											inboundDetails.emailId !== id && (
												<div>
													<span className="text-muted-foreground">
														Legacy Email ID (receivedEmails.id):
													</span>
													<div className="mt-1 text-xs text-muted-foreground font-mono">
														{inboundDetails.emailId}
													</div>
												</div>
											)}
										{((isInbound && inboundDetails?.messageId) ||
											(outboundDetails && "id" in outboundDetails)) && (
											<div>
												<span className="text-muted-foreground">
													Message ID (RFC 822):
												</span>
												<div className="mt-1">
													<ClickableId
														id={
															isInbound
																? inboundDetails?.messageId || ""
																: outboundDetails?.id || ""
														}
														preview={true}
													/>
												</div>
											</div>
										)}
										{isInbound && inboundDetails?.fromName && (
											<div>
												<span className="text-muted-foreground">From Name:</span>
												<div className="mt-1">
													<ClickableId id={inboundDetails.fromName} />
												</div>
											</div>
										)}
										<div>
											<span className="text-muted-foreground">From:</span>
											<div className="mt-1">
												<ClickableId id={isInbound
													? inboundDetails?.from || "unknown"
													: outboundDetails?.from || "unknown"} />
											</div>
										</div>
										{isInbound && inboundDetails?.recipientName && (
											<div>
												<span className="text-muted-foreground">To Name:</span>
												<div className="mt-1">
													<ClickableId id={inboundDetails.recipientName} />
												</div>
											</div>
										)}
										<div>
											<span className="text-muted-foreground">To:</span>
											<div className="mt-1">
												{isInbound ? (
													<ClickableId id={inboundDetails?.recipient || "unknown"} />
												) : (
													outboundDetails?.to?.map((r, i) => (
														<div key={i}>
															<ClickableId id={r} />
														</div>
													))
												)}
											</div>
										</div>
										<div>
											<span className="text-muted-foreground">Subject:</span>
											<p className="font-medium">
												{(() => {
													const subject =
														(isInbound
															? inboundDetails?.subject
															: outboundDetails?.subject) || "No Subject";
													return subject.length > 20
														? subject.substring(0, 20) + "..."
														: subject;
												})()}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Date:</span>
											<p className="font-medium">
												{format(
													new Date(
														isInbound
															? inboundDetails?.receivedAt ||
																	inboundDetails?.createdAt ||
																	new Date()
															: outboundDetails?.created_at || new Date(),
													),
													"PPpp",
												)}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>

							{isInbound && (
								<Card className="rounded-xl overflow-hidden">
									<CardContent className="p-6">
										<h3 className="text-sm font-semibold mb-3">
											Authentication
										</h3>
										<div className="flex flex-wrap gap-2">
											<Badge
												variant={
													inboundDetails?.security.spf === "PASS"
														? "default"
														: "destructive"
												}
												className={
													inboundDetails?.security.spf === "PASS"
														? "bg-green-500/10 text-green-600 border-green-500/20"
														: ""
												}
											>
												{inboundDetails?.security.spf === "PASS" ? (
													<ShieldCheck
														width="12"
														height="12"
														className="mr-1"
													/>
												) : (
													<Ban2 width="12" height="12" className="mr-1" />
												)}{" "}
												SPF: {inboundDetails?.security.spf}
											</Badge>
											<Badge
												variant={
													inboundDetails?.security.dkim === "PASS"
														? "default"
														: "destructive"
												}
												className={
													inboundDetails?.security.dkim === "PASS"
														? "bg-green-500/10 text-green-600 border-green-500/20"
														: ""
												}
											>
												{inboundDetails?.security.dkim === "PASS" ? (
													<ShieldCheck
														width="12"
														height="12"
														className="mr-1"
													/>
												) : (
													<Ban2 width="12" height="12" className="mr-1" />
												)}{" "}
												DKIM: {inboundDetails?.security.dkim}
											</Badge>
											<Badge
												variant={
													inboundDetails?.security.dmarc === "PASS"
														? "default"
														: "destructive"
												}
												className={
													inboundDetails?.security.dmarc === "PASS"
														? "bg-green-500/10 text-green-600 border-green-500/20"
														: ""
												}
											>
												{inboundDetails?.security.dmarc === "PASS" ? (
													<ShieldCheck
														width="12"
														height="12"
														className="mr-1"
													/>
												) : (
													<Ban2 width="12" height="12" className="mr-1" />
												)}{" "}
												DMARC: {inboundDetails?.security.dmarc}
											</Badge>
											<Badge
												variant={
													inboundDetails?.security.spam === "PASS"
														? "default"
														: "destructive"
												}
												className={
													inboundDetails?.security.spam === "PASS"
														? "bg-green-500/10 text-green-600 border-green-500/20"
														: ""
												}
											>
												Spam: {inboundDetails?.security.spam}
											</Badge>
											<Badge
												variant={
													inboundDetails?.security.virus === "PASS"
														? "default"
														: "destructive"
												}
												className={
													inboundDetails?.security.virus === "PASS"
														? "bg-green-500/10 text-green-600 border-green-500/20"
														: ""
												}
											>
												Virus: {inboundDetails?.security.virus}
											</Badge>
										</div>
									</CardContent>
								</Card>
							)}

							{isInbound &&
								inboundDetails?.content?.attachments &&
								inboundDetails.content.attachments.length > 0 && (
									<Card className="rounded-xl overflow-hidden">
										<CardContent className="p-6">
											<h3 className="text-sm font-semibold mb-3">
												Attachments ({inboundDetails.content.attachments.length}
												)
											</h3>
											<AttachmentList
												emailId={inboundDetails.id}
												attachments={inboundDetails.content.attachments}
											/>
										</CardContent>
									</Card>
								)}
						</div>
					</div>
				</div>
			</div>
		</ScrollPersistWrapper>
	);
}
