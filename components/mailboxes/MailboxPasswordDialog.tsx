"use client";

import { useState } from "react";
import { toast } from "sonner";

import Clipboard2 from "@/components/icons/clipboard-2";
import ShieldCheck from "@/components/icons/shield-check";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MailboxType } from "@/features/mailboxes/types";

interface MailboxPasswordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	password: string;
	loginAddress: string;
	type: MailboxType;
	wasRotated: boolean;
}

export function MailboxPasswordDialog({
	open,
	onOpenChange,
	password,
	loginAddress,
	type,
	wasRotated,
}: MailboxPasswordDialogProps) {
	const [copied, setCopied] = useState(false);

	const copyPassword = async () => {
		try {
			await navigator.clipboard.writeText(password);
			setCopied(true);
			toast.success("Password copied");
		} catch {
			toast.error("Failed to copy password");
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) setCopied(false);
		onOpenChange(nextOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{wasRotated
							? "Credential password rotated"
							: type === "mailbox"
								? "Mailbox + SMTP credential created"
								: "SMTP credential created"}
					</DialogTitle>
					<DialogDescription>
						Use these credentials to connect your email client.
					</DialogDescription>
				</DialogHeader>

				<Alert>
					<ShieldCheck width="18" height="18" />
					<AlertTitle>Save this password now</AlertTitle>
					<AlertDescription>
						This password is shown once and cannot be recovered. Store it in a
						password manager.
					</AlertDescription>
				</Alert>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Username</Label>
						<Input value={loginAddress} readOnly className="font-mono" />
					</div>
					<div className="space-y-2">
						<Label>Password</Label>
						<div className="flex gap-2">
							<Input value={password} readOnly className="font-mono" />
							<Button
								type="button"
								variant="secondary"
								onClick={copyPassword}
								aria-label="Copy password"
							>
								<Clipboard2 width="16" height="16" className="mr-2" />
								{copied ? "Copied" : "Copy"}
							</Button>
						</div>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						{type === "mailbox" && (
							<div className="rounded-md border bg-muted/30 p-4">
								<p className="mb-3 text-sm font-medium">IMAP settings</p>
								<dl className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-sm">
									<dt className="text-muted-foreground">Host</dt>
									<dd className="break-all font-mono">imap.inboundemail.com</dd>
									<dt className="text-muted-foreground">Port</dt>
									<dd className="font-mono">993</dd>
									<dt className="text-muted-foreground">Security</dt>
									<dd>TLS</dd>
								</dl>
							</div>
						)}

						<div className="rounded-md border bg-muted/30 p-4">
							<p className="mb-3 text-sm font-medium">SMTP settings</p>
							<dl className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-sm">
								<dt className="text-muted-foreground">Host</dt>
								<dd className="break-all font-mono">smtp.inboundemail.com</dd>
								<dt className="text-muted-foreground">Port</dt>
								<dd>
									<span className="font-mono">465</span> (TLS)
								</dd>
								<dt className="text-muted-foreground">Alternate</dt>
								<dd>
									<span className="font-mono">587</span> (STARTTLS)
								</dd>
							</dl>
						</div>
					</div>
					<Button className="w-full" onClick={() => handleOpenChange(false)}>
						I saved the password
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
