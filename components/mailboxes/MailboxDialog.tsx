"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import CirclePlus from "@/components/icons/circle-plus";
import Trash2 from "@/components/icons/trash-2";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	useCreateMailboxMutation,
	useUpdateMailboxMutation,
} from "@/features/mailboxes/hooks";
import type {
	Mailbox,
	MailboxAccessMode,
	MailboxScopeInput,
} from "@/features/mailboxes/types";

interface SelectableDomain {
	id: string;
	domain: string;
}

interface MailboxDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mailbox: Mailbox | null;
	domains: SelectableDomain[];
	isLoadingDomains: boolean;
	onPasswordCreated: (password: string, loginAddress: string) => void;
}

type ScopeDraftType = "domain" | "address";

const initialForm = {
	name: "",
	loginAddress: "",
	accessMode: "read" as MailboxAccessMode,
	scopes: [] as MailboxScopeInput[],
};

export function MailboxDialog({
	open,
	onOpenChange,
	mailbox,
	domains,
	isLoadingDomains,
	onPasswordCreated,
}: MailboxDialogProps) {
	const nameId = useId();
	const loginId = useId();
	const accessId = useId();
	const [form, setForm] = useState(initialForm);
	const [scopeType, setScopeType] = useState<ScopeDraftType>("domain");
	const [scopeDomainId, setScopeDomainId] = useState("");
	const [scopeLocalPart, setScopeLocalPart] = useState("");
	const [errors, setErrors] = useState<Record<string, string>>({});
	const createMailbox = useCreateMailboxMutation();
	const updateMailbox = useUpdateMailboxMutation();
	const isPending = createMailbox.isPending || updateMailbox.isPending;

	useEffect(() => {
		if (!open) return;

		setForm(
			mailbox
				? {
						name: mailbox.name,
						loginAddress: mailbox.loginAddress,
						accessMode: mailbox.accessMode,
						scopes: mailbox.scopes.map(({ type, domainId, address }) => ({
							type,
							domainId,
							address: address ?? undefined,
						})),
					}
				: initialForm,
		);
		setScopeType("domain");
		setScopeDomainId(domains[0]?.id ?? "");
		setScopeLocalPart("");
		setErrors({});
	}, [open, mailbox, domains]);

	const domainName = (domainId: string) =>
		domains.find((domain) => domain.id === domainId)?.domain ??
		mailbox?.scopes.find((scope) => scope.domainId === domainId)?.domain ??
		"Unknown domain";

	const scopeLabel = (scope: MailboxScopeInput) =>
		scope.type === "domain"
			? `*@${domainName(scope.domainId)}`
			: (scope.address ?? domainName(scope.domainId));

	const addScope = () => {
		if (!scopeDomainId) {
			setErrors((current) => ({ ...current, scopeDraft: "Choose a domain" }));
			return;
		}

		const localPart = scopeLocalPart.trim().toLowerCase();
		if (scopeType === "address" && (!localPart || localPart.includes("@"))) {
			setErrors((current) => ({
				...current,
				scopeDraft: "Enter a local part without @",
			}));
			return;
		}

		const address =
			scopeType === "address"
				? `${localPart}@${domainName(scopeDomainId)}`
				: undefined;
		const duplicate = form.scopes.some(
			(scope) =>
				scope.type === scopeType &&
				scope.domainId === scopeDomainId &&
				(scope.address ?? "").toLowerCase() === (address ?? "").toLowerCase(),
		);

		if (duplicate) {
			setErrors((current) => ({
				...current,
				scopeDraft: "That scope has already been added",
			}));
			return;
		}

		setForm((current) => ({
			...current,
			scopes: [
				...current.scopes,
				{ type: scopeType, domainId: scopeDomainId, address },
			],
		}));
		setScopeLocalPart("");
		setErrors((current) => ({ ...current, scopes: "", scopeDraft: "" }));
	};

	const validate = () => {
		const nextErrors: Record<string, string> = {};
		if (!form.name.trim()) nextErrors.name = "Name is required";
		if (!/^\S+@\S+\.\S+$/.test(form.loginAddress.trim())) {
			nextErrors.loginAddress = "Enter a valid login email";
		}
		if (form.scopes.length === 0) nextErrors.scopes = "Add at least one scope";
		setErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!validate()) return;

		const input = {
			name: form.name.trim(),
			loginAddress: form.loginAddress.trim().toLowerCase(),
			accessMode: form.accessMode,
			scopes: form.scopes,
		};

		try {
			if (mailbox) {
				await updateMailbox.mutateAsync({ id: mailbox.id, input });
				toast.success("Mailbox updated");
				onOpenChange(false);
			} else {
				const result = await createMailbox.mutateAsync(input);
				onOpenChange(false);
				onPasswordCreated(result.password, result.data.loginAddress);
				toast.success("Mailbox created");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Mailbox request failed",
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{mailbox ? "Edit mailbox" : "Create mailbox"}
					</DialogTitle>
					<DialogDescription>
						Configure IMAP credentials and limit which inbound messages this
						mailbox can access.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-5">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor={nameId}>Name</Label>
							<Input
								id={nameId}
								value={form.name}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										name: event.target.value,
									}))
								}
								placeholder="Support inbox"
								aria-invalid={Boolean(errors.name)}
							/>
							{errors.name && (
								<p className="text-xs text-destructive">{errors.name}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor={loginId}>Login email</Label>
							<Input
								id={loginId}
								type="email"
								value={form.loginAddress}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										loginAddress: event.target.value,
									}))
								}
								placeholder="imap@example.com"
								aria-invalid={Boolean(errors.loginAddress)}
							/>
							{errors.loginAddress && (
								<p className="text-xs text-destructive">
									{errors.loginAddress}
								</p>
							)}
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor={accessId}>Access</Label>
						<Select
							value={form.accessMode}
							onValueChange={(value) =>
								setForm((current) => ({
									...current,
									accessMode: value === "read_write" ? "read_write" : "read",
								}))
							}
						>
							<SelectTrigger id={accessId}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="read">Read only</SelectItem>
								<SelectItem value="read_write">Read and write</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-3">
						<div>
							<Label>Scopes</Label>
							<p className="mt-1 text-xs text-muted-foreground">
								Grant a whole verified domain or one exact address.
							</p>
						</div>

						{form.scopes.length > 0 && (
							<div className="space-y-2">
								{form.scopes.map((scope, index) => (
									<div
										key={`${scope.type}-${scope.domainId}-${scope.address ?? "*"}`}
										className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
									>
										<div className="min-w-0">
											<p className="truncate font-mono text-sm">
												{scopeLabel(scope)}
											</p>
											<p className="text-xs text-muted-foreground">
												{scope.type === "domain"
													? "Domain wildcard"
													: "Exact address"}
											</p>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() =>
												setForm((current) => ({
													...current,
													scopes: current.scopes.filter(
														(_, scopeIndex) => scopeIndex !== index,
													),
												}))
											}
											aria-label={`Remove ${scopeLabel(scope)}`}
										>
											<Trash2 width="16" height="16" />
										</Button>
									</div>
								))}
							</div>
						)}

						<div className="rounded-md border p-3">
							<div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
								<Select
									value={scopeType}
									onValueChange={(value) =>
										setScopeType(value === "address" ? "address" : "domain")
									}
								>
									<SelectTrigger aria-label="Scope type">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="domain">Domain</SelectItem>
										<SelectItem value="address">Address</SelectItem>
									</SelectContent>
								</Select>

								<div className="flex min-w-0 gap-2">
									{scopeType === "address" && (
										<Input
											value={scopeLocalPart}
											onChange={(event) =>
												setScopeLocalPart(event.target.value)
											}
											placeholder="local-part"
											aria-label="Address local part"
											className="min-w-0"
										/>
									)}
									<Select
										value={scopeDomainId}
										onValueChange={setScopeDomainId}
									>
										<SelectTrigger
											className="min-w-0 flex-1"
											aria-label="Domain"
										>
											<SelectValue
												placeholder={
													isLoadingDomains ? "Loading..." : "Choose domain"
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{domains.map((domain) => (
												<SelectItem key={domain.id} value={domain.id}>
													{scopeType === "domain" ? "*@" : "@"}
													{domain.domain}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<Button
									type="button"
									variant="secondary"
									onClick={addScope}
									disabled={domains.length === 0}
								>
									<CirclePlus width="14" height="14" className="mr-1" />
									Add
								</Button>
							</div>
							{!isLoadingDomains && domains.length === 0 && (
								<p className="mt-2 text-xs text-muted-foreground">
									Add and verify a domain before creating a mailbox.
								</p>
							)}
							{errors.scopeDraft && (
								<p className="mt-2 text-xs text-destructive">
									{errors.scopeDraft}
								</p>
							)}
						</div>
						{errors.scopes && (
							<p className="text-xs text-destructive">{errors.scopes}</p>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => onOpenChange(false)}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending || domains.length === 0}>
							{isPending
								? mailbox
									? "Saving..."
									: "Creating..."
								: mailbox
									? "Save changes"
									: "Create mailbox"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
