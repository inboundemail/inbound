"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEndpointByIdQuery } from "@/features/endpoints/hooks";
import { useDomainsStatsQuery } from "@/features/domains/hooks/useDomainsQuery";
import {
	useUpdateEndpointMutation,
	useTestEndpointMutation,
} from "@/features/endpoints/hooks";
import type { WebhookFormat } from "@/lib/db/schema";
import type {
	EmailForwardConfig,
	EmailGroupConfig,
	EndpointConfig,
	WebhookConfig,
	UpdateEndpointData,
} from "@/features/endpoints/types";
import { WEBHOOK_FORMAT_CONFIGS } from "@/lib/webhooks/webhook-formats";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Gear2 from "@/components/icons/gear-2";
import CirclePlus from "@/components/icons/circle-plus";
import BoltLightning from "@/components/icons/bolt-lightning";
import Envelope2 from "@/components/icons/envelope-2";
import UserGroup from "@/components/icons/user-group";
import ChevronLeft from "@/components/icons/chevron-left";
import { toast } from "sonner";
import CircleXmark from "@/components/icons/circle-xmark";
import CirclePlay from "@/components/icons/circle-play";
import CircleCheck from "@/components/icons/circle-check";
import TabClose from "@/components/icons/tab-close";
import Clock2 from "@/components/icons/clock-2";
import { Separator } from "@/components/ui/separator";

export default function EndpointDetailsPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const endpointId = params?.id ?? "";

	const { data, isLoading, error } = useEndpointByIdQuery(endpointId);
	const { data: domainsData } = useDomainsStatsQuery();
	const updateEndpointMutation = useUpdateEndpointMutation();

	const verifiedDomains = useMemo(() => {
		return domainsData?.domains?.filter((d) => d.isVerified) || [];
	}, [domainsData]);

	const [formData, setFormData] = useState<UpdateEndpointData>({
		name: "",
		description: "",
		isActive: true,
	});

	const [webhookFormat, setWebhookFormat] = useState<WebhookFormat>("inbound");

	const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
		url: "",
		timeout: 30,
		retryAttempts: 3,
		headers: {},
	});
	const [headerKey, setHeaderKey] = useState("");
	const [headerValue, setHeaderValue] = useState("");

	const [emailConfig, setEmailConfig] = useState<EmailForwardConfig>({
		forwardTo: "",
		includeAttachments: true,
		subjectPrefix: "",
		fromAddress: "",
		senderName: "",
	});

	const [emailGroupConfig, setEmailGroupConfig] = useState<EmailGroupConfig>({
		emails: [],
		includeAttachments: true,
		subjectPrefix: "",
		fromAddress: "",
		senderName: "",
	});
	const [newEmail, setNewEmail] = useState("");

	const [errors, setErrors] = useState<Record<string, string>>({});

	// Inline tester state (webhook only)
	const testEndpointMutation = useTestEndpointMutation();
	const [testFormat, setTestFormat] = useState<WebhookFormat>("inbound");
	const [overrideUrl, setOverrideUrl] = useState("");
	const [logLines, setLogLines] = useState<Array<{ ts: Date; text: string }>>(
		[],
	);
	const logEndRef = useRef<HTMLDivElement | null>(null);

	// Populate local state when API data loads
	useEffect(() => {
		if (!data) return;

		setFormData({
			name: data.name,
			description: data.description || "",
			isActive: data.isActive ?? true,
		});

		if (data.type === "webhook") {
			setWebhookFormat(
				((data as any).webhookFormat as WebhookFormat) || "inbound",
			);
		}

		const cfg = data.config as EndpointConfig;
		if (data.type === "webhook") {
			const wc = cfg as WebhookConfig;
			setWebhookConfig({
				url: wc.url ?? "",
				timeout: Math.min(wc.timeout ?? 30, 30),
				retryAttempts: wc.retryAttempts ?? 3,
				headers: wc.headers ?? {},
			});
		} else if (data.type === "email") {
			const ec = cfg as EmailForwardConfig;
			setEmailConfig({
				forwardTo: ec.forwardTo || "",
				includeAttachments: ec.includeAttachments ?? true,
				subjectPrefix: ec.subjectPrefix || "",
				fromAddress: ec.fromAddress || "",
				senderName: ec.senderName || "",
			});
		} else if (data.type === "email_group") {
			const eg = cfg as EmailGroupConfig;
			setEmailGroupConfig({
				emails: eg.emails || [],
				includeAttachments: eg.includeAttachments ?? true,
				subjectPrefix: eg.subjectPrefix || "",
				fromAddress: eg.fromAddress || "",
				senderName: eg.senderName || "",
			});
		}

		setErrors({});
	}, [data]);

	// Keep tester defaults in sync with current config
	useEffect(() => {
		if (data?.type === "webhook") {
			setTestFormat(webhookFormat || "inbound");
		}
	}, [data?.type, webhookFormat]);

	useEffect(() => {
		if (data?.type === "webhook") {
			setOverrideUrl((prev) => prev || webhookConfig.url || "");
		}
	}, [data?.type, webhookConfig.url]);

	useEffect(() => {
		if (logEndRef.current) {
			logEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [logLines]);

	const appendLog = (text: string) => {
		setLogLines((prev) => [...prev, { ts: new Date(), text }]);
	};

	const formatLabel = (val: WebhookFormat) => {
		switch (val) {
			case "discord":
				return "Discord";
			case "slack":
				return "Slack";
			case "inbound":
			default:
				return "Inbound";
		}
	};

	const handleRunWebhookTest = async () => {
		if (!data) return;
		const urlToUse =
			(overrideUrl && overrideUrl.trim()) || webhookConfig.url || "";
		if (!urlToUse) {
			setErrors((prev) => ({ ...prev, url: "URL is required to run a test" }));
			return;
		}
		try {
			new URL(urlToUse);
		} catch {
			setErrors((prev) => ({ ...prev, url: "Please enter a valid URL" }));
			appendLog("[error] Invalid URL");
			return;
		}
		appendLog(`[request] POST ${urlToUse} format=${testFormat}`);
		try {
			const result = await testEndpointMutation.mutateAsync({
				id: data.id,
				webhookFormat: testFormat,
				overrideUrl: urlToUse,
			});
			appendLog(
				`[response] status=${result.statusCode ?? "n/a"} time=${result.responseTime}ms success=${result.success}`,
			);
			if (result.message) appendLog(`[message] ${result.message}`);
			if (result.responseBody) appendLog(`[body] ${result.responseBody}`);
			if (result.error) appendLog(`[error] ${result.error}`);
		} catch (err) {
			let msg = "Unknown error";
			if (err instanceof Error) {
				msg = err.message;
			} else if (typeof err === "string") {
				msg = err;
			} else if (err && typeof err === "object") {
				const errObj = err as Record<string, unknown>;
				if (typeof errObj.error === "string") msg = errObj.error;
				else if (typeof errObj.message === "string") msg = errObj.message;
				else {
					try {
						msg = JSON.stringify(err);
					} catch {
						msg = "Request failed - check network connectivity";
					}
				}
			}
			appendLog(`[error] ${msg}`);
		}
	};

	const validateForm = (): boolean => {
		const newErrors: Record<string, string> = {};

		if (!formData.name?.trim()) {
			newErrors.name = "Name is required";
		}

		if (!data) {
			setErrors(newErrors);
			return false;
		}

		if (data.type === "webhook") {
			if (!webhookConfig.url.trim()) {
				newErrors.url = "URL is required";
			} else {
				try {
					new URL(webhookConfig.url);
				} catch {
					newErrors.url = "Please enter a valid URL";
				}
			}
			if (
				webhookConfig.timeout != null &&
				(webhookConfig.timeout < 1 || webhookConfig.timeout > 30)
			) {
				newErrors.timeout = "Timeout must be between 1 and 30 seconds";
			}
			if (
				webhookConfig.retryAttempts != null &&
				(webhookConfig.retryAttempts < 0 || webhookConfig.retryAttempts > 10)
			) {
				newErrors.retryAttempts = "Retry attempts must be between 0 and 10";
			}
		}

		if (data.type === "email") {
			if (!emailConfig.forwardTo.trim()) {
				newErrors.forwardTo = "Forward to email is required";
			} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.forwardTo)) {
				newErrors.forwardTo = "Please enter a valid email address";
			}
		}

		if (data.type === "email_group") {
			if (emailGroupConfig.emails.length === 0) {
				newErrors.emails = "At least one email address is required";
			}
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!data || !validateForm()) return;

		let config: WebhookConfig | EmailForwardConfig | EmailGroupConfig;
		switch (data.type) {
			case "webhook":
				config = webhookConfig;
				break;
			case "email":
				config = emailConfig;
				break;
			case "email_group":
				config = emailGroupConfig;
				break;
			default:
				return;
		}

		const updateData: UpdateEndpointData = {
			...formData,
			webhookFormat: data.type === "webhook" ? webhookFormat : undefined,
			config,
		};

		try {
			await updateEndpointMutation.mutateAsync({
				id: data.id,
				data: updateData,
			});
			toast.success("Endpoint updated successfully!");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to update endpoint",
			);
		}
	};

	const addHeader = () => {
		if (headerKey.trim() && headerValue.trim()) {
			setWebhookConfig((prev) => ({
				...prev,
				headers: {
					...(prev.headers || {}),
					[headerKey.trim()]: headerValue.trim(),
				},
			}));
			setHeaderKey("");
			setHeaderValue("");
		}
	};

	const removeHeader = (key: string) => {
		setWebhookConfig((prev) => {
			const newHeaders = { ...(prev.headers || {}) };
			delete newHeaders[key];
			return { ...prev, headers: newHeaders };
		});
	};

	const addEmail = () => {
		if (newEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
			if (!emailGroupConfig.emails.includes(newEmail.trim())) {
				setEmailGroupConfig((prev) => ({
					...prev,
					emails: [...prev.emails, newEmail.trim()],
				}));
				setNewEmail("");
			}
		}
	};

	const removeEmail = (email: string) => {
		setEmailGroupConfig((prev) => ({
			...prev,
			emails: prev.emails.filter((e) => e !== email),
		}));
	};

	const getIconMeta = () => {
		switch (data?.type) {
			case "webhook":
				return { icon: BoltLightning };
			case "email":
				return { icon: Envelope2 };
			case "email_group":
				return { icon: UserGroup };
			default:
				return { icon: Gear2 };
		}
	};

	if (isLoading) {
		return (
			<div className="p-6 space-y-6">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8" />
					<Skeleton className="h-7 w-48" />
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-24 w-full" />
					</div>
					<div className="space-y-4">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-6">
				<div className="text-sm text-destructive">Failed to load endpoint.</div>
				<Button
					variant="secondary"
					className="mt-3"
					onClick={() => router.push("/endpoints")}
				>
					<ChevronLeft className="h-4 w-4 mr-2" /> Back to Endpoints
				</Button>
			</div>
		);
	}

	if (!data) return null;

	const { icon: Icon } = getIconMeta();

	return (
		<div className="p-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Button variant="secondary" onClick={() => router.push("/endpoints")}>
						<ChevronLeft className="h-4 w-4 mr-1" /> Back
					</Button>
					<div className="flex items-center gap-2">
						<div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
							<Icon className="h-4 w-4 text-muted-foreground" />
						</div>
						<h1 className="text-xl font-semibold">Edit Endpoint</h1>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="secondary" onClick={() => router.push("/endpoints")}>
						Cancel
					</Button>
					<Button
						onClick={() => handleSubmit()}
						disabled={updateEndpointMutation.isPending}
					>
						{updateEndpointMutation.isPending ? "Updating..." : "Save Changes"}
					</Button>
				</div>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				<div className="flex items-center justify-between p-3 bg-muted rounded-lg">
					<div>
						<Label className="text-sm font-medium">Status</Label>
						<p className="text-xs text-muted-foreground">
							Enable or disable this endpoint
						</p>
					</div>
					<Switch
						checked={formData.isActive}
						onCheckedChange={(checked) =>
							setFormData((prev) => ({ ...prev, isActive: checked }))
						}
					/>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div className="space-y-4">
						<h3 className="text-sm font-medium text-foreground border-b border-border pb-2">
							Basic Information
						</h3>

						<div className="space-y-2">
							<Label htmlFor="name">Name *</Label>
							<Input
								id="name"
								value={formData.name || ""}
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, name: e.target.value }))
								}
								placeholder={
									data.type === "webhook"
										? "Production Webhook"
										: data.type === "email"
											? "Support Email Forward"
											: "Team Email Group"
								}
								className={errors.name ? "border-red-500" : ""}
							/>
							{errors.name && (
								<p className="text-sm text-red-500">{errors.name}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Description</Label>
							<Textarea
								id="description"
								value={formData.description || ""}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										description: e.target.value,
									}))
								}
								placeholder="Optional description of this endpoint's purpose"
								rows={3}
							/>
						</div>

						{data.type === "webhook" && (
							<div className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="url">URL *</Label>
									<Input
										id="url"
										type="url"
										value={webhookConfig.url || ""}
										onChange={(e) =>
											setWebhookConfig((prev) => ({
												...prev,
												url: e.target.value,
											}))
										}
										placeholder="https://your-app.com/webhooks/inbound"
										className={errors.url ? "border-red-500" : ""}
									/>
									{errors.url && (
										<p className="text-sm text-red-500">{errors.url}</p>
									)}
								</div>

								<Separator />

								<div className="space-y-2">
									<Label className="text-sm font-medium">Test Webhook</Label>
									<div className="space-y-2">
										<div className="space-y-1">
											<Label
												htmlFor="overrideUrl"
												className="text-xs text-muted-foreground"
											>
												Override URL (optional)
											</Label>
											<Input
												id="overrideUrl"
												type="url"
												value={overrideUrl}
												onChange={(e) => setOverrideUrl(e.target.value)}
												placeholder="Leave blank to use saved URL"
											/>
										</div>
										<div className="space-y-1">
											<Label
												htmlFor="testFormat"
												className="text-xs text-muted-foreground"
											>
												Format
											</Label>
											<Select
												value={testFormat}
												defaultValue={testFormat}
												onValueChange={(v: WebhookFormat) => setTestFormat(v)}
											>
												<SelectTrigger id="testFormat">
													<SelectValue placeholder={formatLabel(testFormat)} />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="inbound">Inbound</SelectItem>
													<SelectItem value="discord">Discord</SelectItem>
													<SelectItem value="slack">Slack</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											onClick={handleRunWebhookTest}
											disabled={testEndpointMutation.isPending}
										>
											<CirclePlay className="h-4 w-4 mr-2" />
											{testEndpointMutation.isPending ? "Testing…" : "Run Test"}
										</Button>
										{testEndpointMutation.isPending && (
											<span className="text-xs text-muted-foreground">
												Sending test request…
											</span>
										)}
									</div>
									<div className="mt-2 rounded-md border border-border bg-black/95 text-white font-mono text-xs p-3 h-40 overflow-auto">
										{logLines.length === 0 ? (
											<div className="text-white/60">
												Logs will appear here…
											</div>
										) : (
											logLines.map((l, i) => (
												<div
													key={i}
													className="whitespace-pre-wrap break-words"
												>
													<span className="text-white/40">
														[{l.ts.toLocaleTimeString()}]
													</span>{" "}
													{l.text}
												</div>
											))
										)}
										<div ref={logEndRef} />
									</div>
									{testEndpointMutation.isSuccess && (
										<div className="flex items-center gap-2 text-xs mt-1">
											{testEndpointMutation.data?.success ? (
												<CircleCheck className="h-3 w-3 text-green-500" />
											) : (
												<TabClose className="h-3 w-3 text-red-500" />
											)}
											<span className="text-muted-foreground">
												Last status:{" "}
												{testEndpointMutation.data?.statusCode ?? "n/a"} ·{" "}
												{testEndpointMutation.data?.responseTime}ms
											</span>
											{testEndpointMutation.data?.urlTested && (
												<span className="text-muted-foreground truncate">
													{" "}
													· {testEndpointMutation.data?.urlTested}
												</span>
											)}
											<Clock2 className="h-3 w-3 text-muted-foreground ml-auto" />
										</div>
									)}
								</div>
							</div>
						)}
					</div>

					<div className="space-y-4">
						<h3 className="text-sm font-medium text-foreground border-b border-border pb-2">
							Configuration
						</h3>

						{data.type === "webhook" && (
							<>
								<div className="space-y-3">
									<Label>Webhook Format</Label>
									<div className="grid gap-3">
										{Object.entries(WEBHOOK_FORMAT_CONFIGS).map(
											([format, config]) => (
												<div
													key={format}
													className={`relative rounded-lg border p-4 transition-all ${
														webhookFormat === format
															? "border-primary bg-accent ring-1 ring-primary cursor-pointer"
															: "border-border hover:border-muted-foreground cursor-pointer"
													}`}
													onClick={() =>
														setWebhookFormat(format as WebhookFormat)
													}
												>
													<div className="flex items-start gap-3">
														<div
															className={`mt-0.5 h-4 w-4 rounded-full border-2 transition-colors ${
																webhookFormat === format
																	? "border-primary bg-primary"
																	: "border-muted-foreground"
															}`}
														>
															{webhookFormat === format && (
																<div className="h-full w-full rounded-full bg-white scale-50" />
															)}
														</div>
														<div className="flex-1 min-w-0">
															<h4 className="font-medium text-foreground">
																{(config as any).name}
															</h4>
														</div>
													</div>
												</div>
											),
										)}
									</div>
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="timeout">Timeout (seconds)</Label>
										<Input
											id="timeout"
											type="number"
											min="1"
											max="30"
											value={webhookConfig.timeout ?? ""}
											onChange={(e) =>
												setWebhookConfig((prev) => ({
													...prev,
													timeout:
														e.target.value === ""
															? undefined
															: Number(e.target.value),
												}))
											}
											className={errors.timeout ? "border-red-500" : ""}
										/>
										{errors.timeout && (
											<p className="text-sm text-red-500">{errors.timeout}</p>
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="retryAttempts">Retry Attempts</Label>
										<Input
											id="retryAttempts"
											type="number"
											min="0"
											max="10"
											value={webhookConfig.retryAttempts ?? ""}
											onChange={(e) =>
												setWebhookConfig((prev) => ({
													...prev,
													retryAttempts:
														e.target.value === ""
															? undefined
															: Number(e.target.value),
												}))
											}
											className={errors.retryAttempts ? "border-red-500" : ""}
										/>
										{errors.retryAttempts && (
											<p className="text-sm text-red-500">
												{errors.retryAttempts}
											</p>
										)}
									</div>
								</div>

								<div className="space-y-2">
									<Label>Custom Headers</Label>
									<div className="flex gap-2">
										<Input
											placeholder="Header name"
											value={headerKey}
											onChange={(e) => setHeaderKey(e.target.value)}
											onKeyDown={(e) =>
												e.key === "Enter" && (e.preventDefault(), addHeader())
											}
										/>
										<Input
											placeholder="Header value"
											value={headerValue}
											onChange={(e) => setHeaderValue(e.target.value)}
											onKeyDown={(e) =>
												e.key === "Enter" && (e.preventDefault(), addHeader())
											}
										/>
										<Button
											type="button"
											variant="secondary"
											size="sm"
											onClick={addHeader}
											disabled={!headerKey.trim() || !headerValue.trim()}
										>
											<CirclePlus className="h-4 w-4" />
										</Button>
									</div>
									<Separator />
									<div className="space-y-2">
										<Label>
											Custom Headers Added:{" "}
											{Object.entries(webhookConfig.headers || {}).length}
										</Label>
									</div>
									{Object.entries(webhookConfig.headers || {}).length > 0 && (
										<div className="mt-3 space-y-2">
											{Object.entries(webhookConfig.headers || {}).map(
												([key, value]) => (
													<div key={key} className="flex gap-2 w-full">
														<Input
															value={key}
															readOnly
															className="opacity-90 cursor-default bg-muted"
														/>
														<Input
															value={String(value)}
															readOnly
															className="opacity-90 cursor-default bg-muted"
														/>
														<Button
															type="button"
															variant="destructive"
															size="sm"
															onClick={() => removeHeader(key)}
															aria-label={`Remove header ${key}`}
														>
															<CircleXmark className="h-4 w-4" />
														</Button>
													</div>
												),
											)}
										</div>
									)}
								</div>
							</>
						)}

						{data.type === "email" && (
							<>
								<div className="space-y-2">
									<Label htmlFor="forwardTo">Forward To Email *</Label>
									<Input
										id="forwardTo"
										type="email"
										value={emailConfig.forwardTo || ""}
										onChange={(e) =>
											setEmailConfig((prev) => ({
												...prev,
												forwardTo: e.target.value,
											}))
										}
										placeholder="support@yourcompany.com"
										className={errors.forwardTo ? "border-red-500" : ""}
									/>
									{errors.forwardTo && (
										<p className="text-sm text-red-500">{errors.forwardTo}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="fromAddress">From Address</Label>
									<Select
										value={emailConfig.fromAddress || "auto-detect"}
										onValueChange={(value) =>
											setEmailConfig((prev) => ({
												...prev,
												fromAddress: value === "auto-detect" ? "" : value,
											}))
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Auto-detect from domain" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="auto-detect">
												Auto-detect from domain
											</SelectItem>
											{verifiedDomains.map((domain: any) => (
												<SelectItem
													key={domain.id}
													value={`noreply@${domain.domain}`}
												>
													noreply@{domain.domain}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="senderName">Sender Name</Label>
									<Input
										id="senderName"
										value={emailConfig.senderName || ""}
										onChange={(e) =>
											setEmailConfig((prev) => ({
												...prev,
												senderName: e.target.value,
											}))
										}
										placeholder="Support Team (leave empty for 'Original Sender via Inbound')"
									/>
									<p className="text-sm text-muted-foreground">
										Custom display name for forwarded emails. If empty, will use
										"Original Sender via Inbound" format.
									</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="subjectPrefix">Subject Prefix</Label>
									<Input
										id="subjectPrefix"
										value={emailConfig.subjectPrefix || ""}
										onChange={(e) =>
											setEmailConfig((prev) => ({
												...prev,
												subjectPrefix: e.target.value,
											}))
										}
										placeholder="[Support]"
									/>
								</div>

								<div className="flex items-center space-x-2">
									<Switch
										id="includeAttachments"
										checked={emailConfig.includeAttachments}
										onCheckedChange={(checked) =>
											setEmailConfig((prev) => ({
												...prev,
												includeAttachments: checked,
											}))
										}
									/>
									<Label htmlFor="includeAttachments">
										Include attachments
									</Label>
								</div>
							</>
						)}

						{data.type === "email_group" && (
							<>
								<div className="space-y-2">
									<Label htmlFor="emails">Email Addresses *</Label>
									<div className="flex gap-2">
										<Input
											id="emails"
											type="email"
											placeholder="team@yourcompany.com"
											value={newEmail}
											onChange={(e) => setNewEmail(e.target.value)}
											onKeyDown={(e) =>
												e.key === "Enter" && (e.preventDefault(), addEmail())
											}
										/>
										<Button
											type="button"
											variant="secondary"
											size="sm"
											onClick={addEmail}
											disabled={
												!newEmail.trim() ||
												!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())
											}
										>
											<CirclePlus className="h-4 w-4" />
										</Button>
									</div>
									{emailGroupConfig.emails.length > 0 && (
										<div className="flex flex-wrap gap-2 mt-2">
											{emailGroupConfig.emails.map((email) => (
												<Badge
													key={email}
													variant="secondary"
													className="text-xs"
												>
													{email}
													<button
														type="button"
														onClick={() => removeEmail(email)}
														className="ml-1 hover:text-red-500"
													>
														<TabClose className="h-3 w-3" />
													</button>
												</Badge>
											))}
										</div>
									)}
									{errors.emails && (
										<p className="text-sm text-red-500">{errors.emails}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="fromAddressGroup">From Address</Label>
									<Select
										value={emailGroupConfig.fromAddress || "auto-detect"}
										onValueChange={(value) =>
											setEmailGroupConfig((prev) => ({
												...prev,
												fromAddress: value === "auto-detect" ? "" : value,
											}))
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Auto-detect from domain" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="auto-detect">
												Auto-detect from domain
											</SelectItem>
											{verifiedDomains.map((domain: any) => (
												<SelectItem
													key={domain.id}
													value={`noreply@${domain.domain}`}
												>
													noreply@{domain.domain}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="senderNameGroup">Sender Name</Label>
									<Input
										id="senderNameGroup"
										value={emailGroupConfig.senderName || ""}
										onChange={(e) =>
											setEmailGroupConfig((prev) => ({
												...prev,
												senderName: e.target.value,
											}))
										}
										placeholder="Team Support (leave empty for 'Original Sender via Inbound')"
									/>
									<p className="text-sm text-muted-foreground">
										Custom display name for forwarded emails. If empty, will use
										"Original Sender via Inbound" format.
									</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="subjectPrefixGroup">Subject Prefix</Label>
									<Input
										id="subjectPrefixGroup"
										value={emailGroupConfig.subjectPrefix || ""}
										onChange={(e) =>
											setEmailGroupConfig((prev) => ({
												...prev,
												subjectPrefix: e.target.value,
											}))
										}
										placeholder="[Team]"
									/>
								</div>

								<div className="flex items-center space-x-2">
									<Switch
										id="includeAttachmentsGroup"
										checked={emailGroupConfig.includeAttachments}
										onCheckedChange={(checked) =>
											setEmailGroupConfig((prev) => ({
												...prev,
												includeAttachments: checked,
											}))
										}
									/>
									<Label htmlFor="includeAttachmentsGroup">
										Include attachments
									</Label>
								</div>
							</>
						)}
					</div>
				</div>
			</form>
		</div>
	);
}
