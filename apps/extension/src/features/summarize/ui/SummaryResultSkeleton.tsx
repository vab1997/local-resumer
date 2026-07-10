import { Skeleton } from '@/src/components/ui/skeleton'

/**
 * Placeholder shown while the lazy-loaded SummaryResult chunk resolves. Lives in the panel
 * bundle (imported eagerly) so it can render instantly; mirrors the result's shape.
 */
export function SummaryResultSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <Skeleton className="h-6 w-3/4" />

      {/* TL;DR */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      {/* Key points */}
      <div className="mt-1 flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  )
}
