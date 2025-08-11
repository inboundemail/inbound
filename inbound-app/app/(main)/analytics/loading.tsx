export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
        <div className="space-y-2">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-8 w-24 bg-muted rounded" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 bg-card border border-border rounded-lg" />
        <div className="h-56 bg-card border border-border rounded-lg" />
      </div>
      <div className="h-80 bg-card border border-border rounded-lg" />
    </div>
  )
}
