import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  /** Fit inside a table cell / framed panel without changing outer chrome. */
  compact?: boolean;
};

/** Uniform empty panel — use compact inside DataTable so chrome height stays stable. */
export function EmptyState({ title, description, icon: Icon = Inbox, action, compact }: Props) {
  return (
    <div
      className={
        compact
          ? "flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
          : "flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-charcoal/15 bg-white/60 px-6 py-10 text-center"
      }
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-orange/10 text-orange-dark">
        <Icon className="h-5 w-5" aria-hidden strokeWidth={1.75} />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-charcoal">{title}</p>
        {description ? <p className="text-sm leading-relaxed text-charcoal-soft">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
