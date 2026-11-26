import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

type Props<T> = {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Initial / full reload — shows skeleton rows inside the same table chrome. */
  loading?: boolean;
  error?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ComponentProps<typeof EmptyState>["icon"];
  emptyAction?: ReactNode;
  toolbar?: ReactNode;
  pageSize?: number;
  /** Allow switching page size (good for large lists). */
  pageSizeOptions?: number[];
  getRowId?: (row: T) => string;
  /** Column count hint for skeleton when headers aren’t ready */
  skeletonColumns?: number;
  skeletonRows?: number;
  /** Compact = denser rows for large datasets. */
  density?: "comfortable" | "compact";
};

/**
 * Stable-layout data table: toolbar + bordered table + footer always mount.
 * Loading uses skeleton rows; empty uses an in-table EmptyState — no chrome swap.
 * Visual styles come from shared `.table-*` classes in index.css (keep in sync with ActionTable).
 */
export function DataTable<T>({
  data,
  columns,
  loading,
  error,
  searchPlaceholder = "Search…",
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon,
  emptyAction,
  toolbar,
  pageSize = 10,
  pageSizeOptions,
  getRowId,
  skeletonColumns,
  skeletonRows = 6,
  density = "comfortable",
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const compact = density === "compact";
  const cellClass = compact ? "table-td-compact" : "table-td";

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
    initialState: { pagination: { pageSize } },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const currentPageSize = table.getState().pagination.pageSize;
  const headerGroups = table.getHeaderGroups();
  const colCount = Math.max(
    skeletonColumns ?? 0,
    headerGroups[0]?.headers.length ?? columns.length,
    1,
  );

  const rangeLabel = useMemo(() => {
    if (loading) return "Loading…";
    if (filteredCount === 0) return "0 results";
    const from = pageIndex * currentPageSize + 1;
    const to = Math.min(from + currentPageSize - 1, filteredCount);
    return `${from}–${to} of ${filteredCount}`;
  }, [currentPageSize, filteredCount, loading, pageIndex]);

  const showEmpty = !loading && !error && filteredCount === 0;
  const showRows = !loading && !error && filteredCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block min-w-0 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-soft"
            aria-hidden
            strokeWidth={1.75}
          />
          <input
            className="input pl-9"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search table"
            disabled={loading}
          />
        </label>
        {toolbar ? <div className="flex shrink-0 flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      <div className="table-shell max-h-[min(70dvh,42rem)]">
        <table className="table-root min-w-[40rem]">
          <thead className="sticky top-0 z-10">
            {headerGroups.map((hg) => (
              <tr key={hg.id} className="table-head-row">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort() && !loading;
                  const sorted = header.column.getIsSorted();
                  const align = header.column.columnDef.meta?.align;
                  return (
                    <th
                      key={header.id}
                      className={`table-th ${align === "right" ? "text-right" : ""}`}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      scope="col"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-md text-charcoal hover:text-orange-dark"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-orange-dark" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 text-orange-dark" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 text-charcoal/35" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: skeletonRows }, (_, r) => (
                <tr key={`sk-${r}`} className="table-body-row">
                  {Array.from({ length: colCount }, (_, c) => (
                    <td key={c} className={cellClass}>
                      <Skeleton className={`h-3.5 ${c === 0 ? "w-36" : c === colCount - 1 ? "w-16" : "w-20"}`} />
                      {c === 0 && !compact ? <Skeleton className="mt-1.5 h-3 w-24" /> : null}
                    </td>
                  ))}
                </tr>
              ))}

            {error && (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState compact title="Couldn’t load data" description={error} icon={emptyIcon} />
                </td>
              </tr>
            )}

            {showEmpty && (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState
                    compact
                    title={globalFilter ? "No matching rows" : emptyTitle}
                    description={globalFilter ? "Try a different search term." : emptyDescription}
                    icon={emptyIcon}
                    action={globalFilter ? undefined : emptyAction}
                  />
                </td>
              </tr>
            )}

            {showRows &&
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="table-body-row">
                  {row.getVisibleCells().map((cell) => {
                    const align = cell.column.columnDef.meta?.align;
                    return (
                      <td key={cell.id} className={`${cellClass} ${align === "right" ? "text-right" : ""}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 text-sm text-charcoal-soft">
        <div className="flex flex-wrap items-center gap-3">
          <p>{rangeLabel}</p>
          {pageSizeOptions && pageSizeOptions.length > 0 ? (
            <label className="flex items-center gap-1.5 text-xs">
              <span>Rows</span>
              <select
                className="input h-8 w-auto min-w-[4.5rem] py-0 text-xs"
                value={currentPageSize}
                disabled={loading}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-secondary h-9 px-2.5"
            disabled={loading || !table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-[4.5rem] text-center text-xs">
            Page {loading ? "—" : pageIndex + 1} / {loading ? "—" : Math.max(pageCount, 1)}
          </span>
          <button
            type="button"
            className="btn-secondary h-9 px-2.5"
            disabled={loading || !table.getCanNextPage()}
            onClick={() => table.nextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
