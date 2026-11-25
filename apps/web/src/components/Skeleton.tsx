import type { HTMLAttributes } from "react";

/** Pulse placeholder — size with className (h-/w-/rounded-). */
export function Skeleton({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      aria-hidden
      {...rest}
    />
  );
}

/** Card-list skeleton matching surface articles (proofs, approvals, leads). */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="surface flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20 rounded-xl" />
            <Skeleton className="h-9 w-20 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stat strip skeleton (consultancy funnel). */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-charcoal/10 bg-white px-4 py-4">
          <Skeleton className="h-7 w-12" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Checklist cards matching DashboardCard (2-up on sm+). */
export function ChecklistSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading checklist">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-2xl border border-charcoal/10 bg-white px-4 py-3.5 sm:py-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-full max-w-[16rem]" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Compact row list (housing enquiries, invoices, files). */
export function RowListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist/60 px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-9 w-20 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
