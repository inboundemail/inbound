export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-32 bg-muted rounded" />
            <div className="h-4 w-64 bg-muted rounded" />
          </div>
          <div className="h-8 w-40 bg-muted rounded" />
        </div>
        <div className="h-24 bg-card border border-border rounded-lg" />
        <div className="h-40 bg-card border border-border rounded-lg" />
        <div className="h-40 bg-card border border-border rounded-lg" />
      </div>
    </div>
  )
}
