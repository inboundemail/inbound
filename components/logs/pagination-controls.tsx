"use client";

import ChevronLeft from "@/components/icons/chevron-left";
import ChevronRight from "@/components/icons/chevron-right";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
	offset: number;
	limit: number;
	total: number;
	isFetching?: boolean;
	onOffsetChange: (offset: number) => void;
	className?: string;
	ariaLabel?: string;
}

export function PaginationControls({
	offset,
	limit,
	total,
	isFetching = false,
	onOffsetChange,
	className,
	ariaLabel = "Email pagination",
}: PaginationControlsProps) {
	if (total <= limit && offset === 0) {
		return null;
	}

	const pageCount = Math.max(1, Math.ceil(total / limit));
	const currentPage = Math.min(pageCount, Math.floor(offset / limit) + 1);
	const firstItem = total === 0 ? 0 : Math.min(offset + 1, total);
	const lastItem = Math.min(offset + limit, total);
	const previousDisabled = offset === 0 || isFetching;
	const nextDisabled = offset + limit >= total || isFetching;

	return (
		<nav
			aria-label={ariaLabel}
			className={cn("flex items-center justify-between gap-3", className)}
		>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-10 aria-disabled:pointer-events-none aria-disabled:opacity-60"
				aria-label="Previous page"
				aria-disabled={previousDisabled}
				onClick={() => {
					if (!previousDisabled) onOffsetChange(Math.max(0, offset - limit));
				}}
			>
				<ChevronLeft width="14" height="14" />
				<span className="hidden sm:inline">Previous</span>
			</Button>

			<span
				className="text-center text-xs text-muted-foreground tabular-nums"
				role="status"
				aria-live="polite"
			>
				Page {currentPage} of {pageCount}
				<span className="hidden sm:inline">
					{" "}
					| {firstItem}-{lastItem} of {total}
				</span>
			</span>

			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-10 aria-disabled:pointer-events-none aria-disabled:opacity-60"
				aria-label="Next page"
				aria-disabled={nextDisabled}
				onClick={() => {
					if (!nextDisabled) onOffsetChange(offset + limit);
				}}
			>
				<span className="hidden sm:inline">Next</span>
				<ChevronRight width="14" height="14" />
			</Button>
		</nav>
	);
}
