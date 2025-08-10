import { EmailLoadingSkeleton } from "@/components/page-loading-skeletons"

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <EmailLoadingSkeleton />
    </div>
  )
}
