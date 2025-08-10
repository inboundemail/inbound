import { PageLoadingSkeleton } from "@/components/page-loading-skeletons"

export default function Loading() {
  return (
    <div className="container mx-auto p-6">
      <PageLoadingSkeleton />
    </div>
  )
}
