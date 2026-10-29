"use client";

import { useId } from "react";
import { toast } from "sonner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useSpamFilterQuery,
	useUpdateSpamFilterMutation,
} from "@/features/mailboxes/hooks";
import { isSpamFilterLevel, type SpamFilterLevel } from "@/lib/guard/junk-verdict";

const LEVELS: Array<{ value: SpamFilterLevel; label: string; description: string }> = [
	{
		value: "strict",
		label: "Strict",
		description: "Also catches possible spam and threats. Expect some false positives.",
	},
	{
		value: "standard",
		label: "Standard",
		description: "Catches likely spam, phishing, fraud and malware.",
	},
	{
		value: "lenient",
		label: "Lenient",
		description: "Only catches clear spam and threats.",
	},
	{
		value: "off",
		label: "Off",
		description: "Never marks mail as junk automatically. Guard junk rules still apply.",
	},
];

export function SpamFilterSettings() {
	const headingId = useId();
	const query = useSpamFilterQuery();
	const mutation = useUpdateSpamFilterMutation();
	const level = query.data?.level;
	const current = LEVELS.find((item) => item.value === level);

	const onChange = async (value: string) => {
		if (!isSpamFilterLevel(value) || value === level) return;
		try {
			await mutation.mutateAsync(value);
			toast.success("Spam filter updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update spam filter",
			);
		}
	};

	return (
		<section
			aria-labelledby={headingId}
			className="mb-4 rounded-xl border border-border bg-card p-4 sm:p-5"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<h3 id={headingId} className="text-sm font-semibold">
						Spam filter
					</h3>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
						Junk mail goes to the Junk folder over IMAP and the API. It is
						still delivered to your endpoints, marked with{" "}
						<span className="font-mono">spam.isJunk</span>.
						{current ? ` ${current.description}` : ""}
					</p>
				</div>
				{query.isLoading ? (
					<Skeleton className="h-9 w-[140px] rounded-xl" />
				) : (
					<Select
						value={level}
						onValueChange={onChange}
						disabled={mutation.isPending || !!query.error}
					>
						<SelectTrigger
							className="h-9 w-[140px] rounded-xl"
							aria-label="Spam filter level"
						>
							<SelectValue placeholder="Level" />
						</SelectTrigger>
						<SelectContent>
							{LEVELS.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
			{query.error && (
				<p role="alert" className="mt-2 text-xs text-destructive">
					{query.error.message}
				</p>
			)}
		</section>
	);
}
