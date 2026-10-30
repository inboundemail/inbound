"use client";

import { formatDistanceToNow } from "date-fns";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useMailboxActivityQuery } from "@/features/mailboxes/hooks";
import type {
	Mailbox,
	MailboxActivity,
	MailboxActivityEvent,
} from "@/features/mailboxes/types";

const EVENT_LABELS: Record<MailboxActivityEvent, string> = {
	login_succeeded: "Signed in",
	login_failed: "Wrong password",
	login_refused: "Sign-in refused",
	session_ended: "Session ended",
	command_error: "Command failed",
	quota_exceeded: "Storage quota exceeded",
	send_failed: "Send failed",
	send_rate_limited: "Daily send limit reached",
	events_dropped: "Events not recorded",
};

function activitySummary(activity: MailboxActivity): string {
	const status = activity.detail?.status;
	return [
		activity.reason?.replaceAll("_", " "),
		typeof status === "number" ? `status ${status}` : null,
		activity.clientIp,
		activity.client,
	]
		.filter(Boolean)
		.join(" · ");
}

function ActivitySkeleton() {
	return (
		<div role="status" aria-label="Loading activity" className="space-y-3">
			{["first", "second", "third"].map((row) => (
				<div key={row} className="py-1">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="mt-2 h-3 w-56 max-w-full" />
				</div>
			))}
		</div>
	);
}

function ActivityList({ mailboxId }: { mailboxId: string }) {
	const query = useMailboxActivityQuery(mailboxId);
	const result = query.data;

	if (result.error !== null) {
		return (
			<div
				role="alert"
				className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4"
			>
				<p className="text-sm text-destructive">{result.error}</p>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => query.refetch()}
					disabled={query.isFetching}
				>
					Try again
				</Button>
			</div>
		);
	}

	if (result.data.data.length === 0) {
		return (
			<p className="py-6 text-center text-sm text-muted-foreground">
				No activity in the last 30 days.
			</p>
		);
	}

	return (
		<div className="max-h-[60vh] overflow-y-auto">
			{result.data.data.map((activity) => (
				<div
					key={activity.id}
					className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0"
				>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm font-medium">
								{EVENT_LABELS[activity.event] ?? activity.event}
							</span>
							<Badge variant="outline">{activity.protocol.toUpperCase()}</Badge>
							{activity.count > 1 && (
								<Badge variant="secondary">×{activity.count}</Badge>
							)}
						</div>
						<p className="mt-1 truncate text-xs text-muted-foreground">
							{activitySummary(activity) || "No details"}
						</p>
					</div>
					<time
						dateTime={activity.lastOccurredAt}
						className="shrink-0 text-xs text-muted-foreground"
					>
						{formatDistanceToNow(new Date(activity.lastOccurredAt), {
							addSuffix: true,
						})}
					</time>
				</div>
			))}
			{result.data.pagination.hasMore && (
				<p className="pt-3 text-xs text-muted-foreground">
					Showing the latest {result.data.data.length} of{" "}
					{result.data.pagination.total} events.
				</p>
			)}
		</div>
	);
}

export function MailboxActivityDialog({
	mailbox,
	onOpenChange,
}: {
	mailbox: Mailbox | null;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={Boolean(mailbox)} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Activity</DialogTitle>
					<DialogDescription>
						Sign-ins, refused sign-ins, sessions and send failures for{" "}
						{mailbox?.name}. Kept for 30 days; message content and passwords are
						never recorded.
					</DialogDescription>
				</DialogHeader>
				{mailbox && (
					<Suspense fallback={<ActivitySkeleton />}>
						<ActivityList mailboxId={mailbox.id} />
					</Suspense>
				)}
			</DialogContent>
		</Dialog>
	);
}
