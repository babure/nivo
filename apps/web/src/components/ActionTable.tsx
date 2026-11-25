import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

export type ActionColumn<T> = {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
};

type Props<T> = {
  columns: ActionColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: ReactNode;
  /** Rightmost actions column header (default blank). */
  actionsHeader?: string;
  actions?: (row: T) => ReactNode;
  skeletonRows?: number;
};

/**
 * Compact actionable table for short lists (papers, enquiries, team).
 * Prefer DataTable for large searchable datasets.
 */
export function ActionTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon,
  emptyAction,
  actionsHeader = "Actions",
  actions,
  skeletonRows = 3,
}: Props<T>) {
  const colSpan = columns.length + (actions ? 1 : 0);

  return (
    <div className="overflow-x-auto overscroll-contain rounded-2xl border border-charcoal/15 bg-white [-webkit-overflow-scrolling:touch]">
      <table className="min-w-[28rem] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-charcoal/15 bg-[#EDE8E0]">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-charcoal ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
            {actions ? (
              <th
                scope="col"
                className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-charcoal"
              >
                {actionsHeader}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={`sk-${i}`} className="border-t border-charcoal/8">
                {columns.map((c, ci) => (
                  <td key={c.key} className="px-3 py-2.5">
                    <Skeleton className={`h-3.5 ${ci === 0 ? "w-28" : "w-16"}`} />
                  </td>
                ))}
                {actions ? (
                  <td className="px-3 py-2.5 text-right">
                    <Skeleton className="ml-auto h-8 w-20 rounded-xl" />
                  </td>
                ) : null}
              </tr>
            ))}

          {!loading && error ? (
            <tr>
              <td colSpan={colSpan}>
                <EmptyState compact title="Couldn’t load data" description={error} icon={emptyIcon} />
              </td>
            </tr>
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan}>
                <EmptyState
                  compact
                  title={emptyTitle}
                  description={emptyDescription}
                  icon={emptyIcon}
                  action={emptyAction}
                />
              </td>
            </tr>
          ) : null}

          {!loading &&
            !error &&
            rows.map((row) => (
              <tr
                key={getRowId(row)}
                className="border-t border-charcoal/8 align-middle odd:bg-white even:bg-[#FAF8F5]"
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 text-charcoal ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
                {actions ? (
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">{actions(row)}</div>
                  </td>
                ) : null}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
