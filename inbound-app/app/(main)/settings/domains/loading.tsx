import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function DomainsLoading() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 p-6">
        {/* Header skeleton with actions on right, then an empty-state skeleton */}
        <PageSkeleton variant="empty" />
      </div>
    </div>
  );
}
