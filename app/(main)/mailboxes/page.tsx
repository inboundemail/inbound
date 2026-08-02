"use client";

import { formatDistanceToNow } from "date-fns";
import { parseAsString, useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import CirclePlus from "@/components/icons/circle-plus";
import DotsVertical from "@/components/icons/dots-vertical";
import EnvelopeOpen from "@/components/icons/envelope-open";
import Filter2 from "@/components/icons/filter-2";
import Gear2 from "@/components/icons/gear-2";
import Magnifier2 from "@/components/icons/magnifier-2";
import Refresh2 from "@/components/icons/refresh-2";
import Trash2 from "@/components/icons/trash-2";
import { MailboxDialog } from "@/components/mailboxes/MailboxDialog";
import { MailboxPasswordDialog } from "@/components/mailboxes/MailboxPasswordDialog";
import SidebarToggleButton from "@/components/sidebar-toggle-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDomainsListV2Query } from "@/features/domains/hooks/useDomainV2Hooks";
import {
	useDeleteMailboxMutation,
	useMailboxesQuery,
	useRotateMailboxPasswordMutation,
	useUpdateMailboxMutation,
} from "@/features/mailboxes/hooks";
import type { Mailbox, MailboxType } from "@/features/mailboxes/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface PasswordState {
	password: string;
	loginAddress: string;
	type: MailboxType;
	wasRotated: boolean;
}

export default function MailboxesPage() {
	const [filters, setFilters] = useQueryStates(
		{
			search: parseAsString.withDefault(""),
			status: parseAsString.withDefault("all"),
		},
		{ history: "push" },
	);
	const search = useDebouncedValue(filters.search, 300).trim().toLowerCase();
	const status = useDebouncedValue(filters.status, 150);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedMailbox, setSelectedMailbox] = useState<Mailbox | null>(null);
	const [deleteMailbox, setDeleteMailbox] = useState<Mailbox | null>(null);
	const [rotateMailbox, setRotateMailbox] = useState<Mailbox | null>(null);
	const [passwordState, setPasswordState] = useState<PasswordState | null>(
		null,
	);

	const mailboxesQuery = useMailboxesQuery();
	const domainsQuery = useDomainsListV2Query({
		limit: 100,
		status: "verified",
	});
	const updateMutation = useUpdateMailboxMutation();
	const deleteMutation = useDeleteMailboxMutation();
	const rotateMutation = useRotateMailboxPasswordMutation();

	const mailboxes = mailboxesQuery.data?.data ?? [];
	const domains = (domainsQuery.data?.data ?? [])
		.filter((domain) => domain.status === "verified")
		.map(({ id, domain }) => ({ id, domain }));
	const filteredMailboxes = mailboxes.filter((mailbox) => {
		const matchesStatus =
			status === "all" ||
			(status === "active" ? mailbox.enabled : !mailbox.enabled);
		const matchesSearch =
			!search ||
			mailbox.name.toLowerCase().includes(search) ||
			mailbox.loginAddress.toLowerCase().includes(search) ||
			mailbox.sendingName?.toLowerCase().includes(search) ||
			mailbox.sendingAddress?.toLowerCase().includes(search) ||
			mailbox.scopes.some((scope) =>
				(scope.address ?? `*@${scope.domain}`).toLowerCase().includes(search),
			);
		return matchesStatus && matchesSearch;
	});

	const openCreate = () => {
		setSelectedMailbox(null);
		setDialogOpen(true);
	};

	const openEdit = (mailbox: Mailbox) => {
		setSelectedMailbox(mailbox);
		setDialogOpen(true);
	};

	const setEnabled = async (mailbox: Mailbox) => {
		try {
			await updateMutation.mutateAsync({
				id: mailbox.id,
				input: { enabled: !mailbox.enabled },
			});
			toast.success(
				mailbox.enabled ? "Credential disabled" : "Credential enabled",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update credential",
			);
		}
	};

	const confirmDelete = async () => {
		if (!deleteMailbox) return;
		try {
			await deleteMutation.mutateAsync(deleteMailbox.id);
			toast.success("Credential deleted");
			setDeleteMailbox(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete credential",
			);
		}
	};

	const confirmRotate = async () => {
		if (!rotateMailbox) return;
		try {
			const mailbox = rotateMailbox;
			const result = await rotateMutation.mutateAsync(mailbox.id);
			setRotateMailbox(null);
			setPasswordState({
				password: result.password,
				loginAddress: mailbox.loginAddress,
				type: mailbox.type,
				wasRotated: true,
			});
			toast.success("Credential password rotated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to rotate password",
			);
		}
	};

	if (mailboxesQuery.error) {
		return (
			<div className="min-h-screen p-4">
				<div className="mx-auto max-w-5xl rounded-xl border border-destructive/20 bg-destructive/10 p-6">
					<div className="flex items-center gap-3 text-destructive">
						<span className="text-sm">{mailboxesQuery.error.message}</span>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => mailboxesQuery.refetch()}
							className="ml-auto"
						>
							Try again
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="min-h-screen p-4">
				<div className="mx-auto max-w-5xl px-2">
					<div className="mb-6">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<SidebarToggleButton />
								<div>
									<h2 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">
										Mailboxes & SMTP
									</h2>
									<p className="text-sm font-medium text-muted-foreground">
										{mailboxesQuery.data?.pagination.total ?? 0} credentials
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Button onClick={openCreate}>
									<CirclePlus width="12" height="12" className="mr-1" />
									<span className="hidden sm:inline">Create credential</span>
									<span className="sm:hidden">Create</span>
								</Button>
								<Button
									variant="outline"
									onClick={() => mailboxesQuery.refetch()}
									disabled={mailboxesQuery.isFetching}
								>
									<Refresh2
										width="14"
										height="14"
										className={
											mailboxesQuery.isFetching
												? "animate-spin sm:mr-2"
												: "sm:mr-2"
										}
									/>
									<span className="hidden sm:inline">Refresh</span>
								</Button>
							</div>
						</div>
					</div>

					<div>
						<div className="flex flex-wrap items-center gap-3">
							<div className="relative min-w-[200px] flex-1">
								<Magnifier2
									width="16"
									height="16"
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									placeholder="Search credentials..."
									value={filters.search}
									onChange={(event) =>
										setFilters({ search: event.target.value || null })
									}
									className="h-9 rounded-xl pl-10"
								/>
							</div>
							<Select
								value={filters.status}
								onValueChange={(value) =>
									setFilters({ status: value === "all" ? null : value })
								}
							>
								<SelectTrigger className="h-9 w-[140px] rounded-xl">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All status</SelectItem>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="disabled">Disabled</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{(filters.search || filters.status !== "all") && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setFilters({ search: null, status: null })}
								className="mt-2 h-8"
							>
								<Filter2 width="14" height="14" className="mr-2" />
								Clear filters
							</Button>
						)}
					</div>
				</div>

				<div className="mx-auto max-w-5xl p-2 py-4">
					{mailboxesQuery.isLoading ? (
						<div className="flex items-center justify-center py-20 text-muted-foreground">
							Loading credentials...
						</div>
					) : filteredMailboxes.length === 0 ? (
						<div className="rounded-xl bg-card p-8">
							<div className="text-center">
								<EnvelopeOpen
									width="48"
									height="48"
									className="mx-auto mb-4 text-muted-foreground"
								/>
								<h3 className="mb-2 text-lg font-semibold text-foreground">
									No credentials found
								</h3>
								<p className="mb-4 text-sm text-muted-foreground">
									{filters.search || filters.status !== "all"
										? "Try adjusting your filters or search query."
										: "Create credentials to receive with IMAP, send with SMTP, or both."}
								</p>
								<Button variant="secondary" onClick={openCreate}>
									<CirclePlus width="16" height="16" className="mr-2" />
									Create your first credential
								</Button>
							</div>
						</div>
					) : (
						<div className="overflow-hidden rounded-[13px] border border-border bg-card">
							{filteredMailboxes.map((mailbox) => {
								const visibleScopes = mailbox.scopes.slice(0, 3);
								const senderIdentity = mailbox.sendingAddress
									? mailbox.sendingName
										? `${mailbox.sendingName} <${mailbox.sendingAddress}>`
										: mailbox.sendingAddress
									: null;
								const lastUsed = mailbox.lastUsedAt
									? `Last used ${formatDistanceToNow(new Date(mailbox.lastUsedAt), { addSuffix: true })}`
									: "Never used";
								return (
									<div
										key={mailbox.id}
										className="flex items-start gap-3 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/50 sm:gap-4 sm:px-5"
									>
										<div className="relative hidden shrink-0 rounded-md bg-muted p-2 sm:block">
											<EnvelopeOpen
												width="23"
												height="23"
												className="text-primary"
											/>
											<span
												className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${mailbox.enabled ? "bg-primary" : "bg-muted-foreground"}`}
											/>
										</div>

										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2 pr-8">
												<span className="truncate text-sm font-medium">
													{mailbox.name}
												</span>
												<Badge
													variant={mailbox.enabled ? "default" : "secondary"}
												>
													{mailbox.enabled ? "Active" : "Disabled"}
												</Badge>
												<Badge variant="outline">
													{mailbox.type === "mailbox"
														? "Mailbox + SMTP"
														: "SMTP only"}
												</Badge>
												<Badge variant="outline">
													{mailbox.sendingMode === "identity"
														? "Exact identity"
														: "Any scoped domain"}
												</Badge>
											</div>
											<div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
												<span className="truncate">
													Login: {mailbox.loginAddress}
												</span>
												{mailbox.type === "mailbox" && (
													<span>
														IMAP:{" "}
														{mailbox.accessMode === "read"
															? "read only"
															: "read / write"}
													</span>
												)}
											</div>
											{senderIdentity && (
												<p className="mt-1 truncate text-xs text-muted-foreground">
													From: {senderIdentity}
												</p>
											)}
											<p className="mt-1 text-xs text-muted-foreground md:hidden">
												{lastUsed}
											</p>
											<div className="mt-3 flex flex-wrap gap-1.5">
												{visibleScopes.map((scope) => (
													<Badge
														key={scope.id}
														variant="secondary"
														className="max-w-[220px] truncate font-mono font-normal"
													>
														{scope.type === "domain"
															? `*@${scope.domain}`
															: scope.address}
													</Badge>
												))}
												{mailbox.scopes.length > 3 && (
													<Badge variant="outline">
														+{mailbox.scopes.length - 3}
													</Badge>
												)}
											</div>
										</div>

										<div className="hidden shrink-0 self-center text-right text-xs text-muted-foreground md:block">
											{lastUsed}
										</div>

										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Actions for ${mailbox.name}`}
												>
													<DotsVertical width="16" height="16" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem onSelect={() => openEdit(mailbox)}>
													<Gear2 width="16" height="16" />
													Edit
												</DropdownMenuItem>
												<DropdownMenuItem
													onSelect={() => setRotateMailbox(mailbox)}
												>
													<Refresh2 width="16" height="16" />
													Rotate password
												</DropdownMenuItem>
												<DropdownMenuItem onSelect={() => setEnabled(mailbox)}>
													{mailbox.enabled ? "Disable" : "Enable"}
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													onSelect={() => setDeleteMailbox(mailbox)}
													className="text-destructive focus:text-destructive"
												>
													<Trash2 width="16" height="16" />
													Delete
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			<MailboxDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				mailbox={selectedMailbox}
				domains={domains}
				isLoadingDomains={domainsQuery.isLoading}
				onPasswordCreated={(password, loginAddress, type) =>
					setPasswordState({ password, loginAddress, type, wasRotated: false })
				}
			/>

			<MailboxPasswordDialog
				open={Boolean(passwordState)}
				onOpenChange={(open) => !open && setPasswordState(null)}
				password={passwordState?.password ?? ""}
				loginAddress={passwordState?.loginAddress ?? ""}
				type={passwordState?.type ?? "mailbox"}
				wasRotated={passwordState?.wasRotated ?? false}
			/>

			<DeleteConfirmationDialog
				open={Boolean(deleteMailbox)}
				onOpenChange={(open) => !open && setDeleteMailbox(null)}
				onConfirm={confirmDelete}
				itemName={deleteMailbox?.name}
				itemType="credential"
				isLoading={deleteMutation.isPending}
				description={`Delete ${deleteMailbox?.name ?? "this credential"}? Any client using it will lose access immediately. This cannot be undone.`}
			/>

			<Dialog
				open={Boolean(rotateMailbox)}
				onOpenChange={(open) => !open && setRotateMailbox(null)}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Rotate credential password</DialogTitle>
						<DialogDescription>
							The current password for {rotateMailbox?.name} will stop working
							immediately. The new password will only be shown once.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="secondary"
							onClick={() => setRotateMailbox(null)}
							disabled={rotateMutation.isPending}
						>
							Cancel
						</Button>
						<Button onClick={confirmRotate} disabled={rotateMutation.isPending}>
							{rotateMutation.isPending ? "Rotating..." : "Rotate password"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
