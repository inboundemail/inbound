import { PageSkeleton } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 p-6">
        {/* Header skeleton + search + content skeletons */}
        <PageSkeleton variant="full" />
      </div>
    </div>
  )
}
