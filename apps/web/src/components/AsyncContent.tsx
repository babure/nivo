import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { ChecklistSkeleton, ListSkeleton, RowListSkeleton } from "./Skeleton";

export type AsyncSkeletonVariant = "list" | "rows" | "checklist" | "custom";

type Props = {
  /** False until first successful/failed load finishes — keeps chrome stable. */
  ready: boolean;
  loading?: boolean;
  error?: string;
  /** When true (and ready, no error), show empty state instead of children. */
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  errorTitle?: string;
  /** Skeleton shape while !ready || loading. */
  skeleton?: AsyncSkeletonVariant;
  skeletonRows?: number;
  /** Used when skeleton="custom". */
  skeletonFallback?: ReactNode;
  /** Optional action under empty state. */
  emptyAction?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Shared loading / error / empty / content switch.
 * Outer wrapper always mounts with a stable min-height so page chrome doesn’t jump.
 */
export function AsyncContent({
  ready,
  loading = false,
  error,
  empty,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon,
  errorTitle = "Couldn’t load data",
  skeleton = "list",
  skeletonRows = 3,
  skeletonFallback,
  emptyAction,
  children,
  className = "",
}: Props) {
  const showSkeleton = !ready || loading;

  let body: ReactNode;
  if (showSkeleton) {
    body =
      skeleton === "custom" && skeletonFallback ? (
        skeletonFallback
      ) : skeleton === "checklist" ? (
        <ChecklistSkeleton rows={skeletonRows} />
      ) : skeleton === "rows" ? (
        <RowListSkeleton rows={skeletonRows} />
      ) : (
        <ListSkeleton rows={skeletonRows} />
      );
  } else if (error) {
    body = <EmptyState title={errorTitle} description={error} icon={emptyIcon} />;
  } else if (empty) {
    body = (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon}
        action={emptyAction}
      />
    );
  } else {
    body = children;
  }

  return (
    <div className={`min-h-[12rem] ${className}`.trim()} data-async-content>
      {body}
    </div>
  );
}
