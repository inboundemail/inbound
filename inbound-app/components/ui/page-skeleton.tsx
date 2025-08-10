import { Skeleton } from "@/components/ui/skeleton"

interface PageSkeletonProps {
  variant?: "table" | "cards" | "empty" | "full"
  showSearch?: boolean
  showHeader?: boolean
  rowCount?: number
}

export function PageSkeleton({ 
  variant = "full", 
  showSearch = true, 
  showHeader = true,
  rowCount = 8 
}: PageSkeletonProps) {
  if (variant === "empty") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      )}

      {/* Search Bar */}
      {showSearch && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
      )}

      {/* Content Area */}
      {variant === "table" && (
        <div className="space-y-4">
          {/* Table Header */}
          <div className="flex items-center space-x-4 border-b pb-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>

          {/* Table Rows */}
          {[...Array(rowCount)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4 py-3 border-b border-border/50">
              <Skeleton className="h-4 w-4" />
              <div className="flex items-center space-x-3 flex-1">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      )}

      {variant === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-20 w-full" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === "full" && (
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border rounded-lg p-6 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>

          {/* Main Content Table */}
          <div className="space-y-4">
            <div className="flex items-center space-x-4 border-b pb-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>

            {[...Array(rowCount)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 py-3 border-b border-border/50">
                <Skeleton className="h-4 w-4" />
                <div className="flex items-center space-x-3 flex-1">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
