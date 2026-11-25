import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CardStatus } from "@nivo/shared";
import { CardStatusTag } from "./CardStatusTag";

type Props = {
  title: string;
  description: string;
  status: CardStatus;
  to?: string;
  index?: number;
  highlighted?: boolean;
  footer?: ReactNode;
  onOpen?: () => void | Promise<void>;
  ctaLabels?: Partial<Record<CardStatus, string>>;
};

const CTA: Record<CardStatus, string> = {
  locked: "Locked",
  available: "Continue",
  in_progress: "Continue",
  completed: "View",
  coming_soon: "Notify me",
};

export function DashboardCard({
  title,
  description,
  status,
  to,
  index,
  highlighted,
  footer,
  onOpen,
  ctaLabels,
}: Props) {
  const canAct =
    status === "available" || status === "in_progress" || status === "completed" || status === "coming_soon";
  const interactive = canAct && (!!to || !!onOpen);
  const cta = { ...CTA, ...ctaLabels };

  return (
    <article
      data-testid="dashboard-card"
      className={[
        "flex h-full flex-col rounded-2xl border bg-white px-4 py-3.5 sm:px-4 sm:py-4",
        highlighted
          ? "border-orange/40 shadow-[0_0_0_1px_rgba(232,109,31,0.12)]"
          : "border-charcoal/10",
        status === "locked" ? "opacity-60" : "",
      ].join(" ")}
      aria-disabled={status === "locked"}
    >
      <div className="flex flex-wrap items-center gap-2">
        {typeof index === "number" && (
          <span className="font-display text-xs font-semibold text-charcoal-soft">
            {String(index).padStart(2, "0")}
          </span>
        )}
        <CardStatusTag status={status} />
        {highlighted ? <span className="text-[11px] font-medium text-orange-dark">Up next</span> : null}
      </div>
      <h3 className="font-display mt-2 text-base font-semibold tracking-tight text-charcoal">{title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-charcoal-soft">{description}</p>
      {footer}
      <div className="mt-3">
        {interactive && to ? (
          <Link to={to} className={`w-full ${highlighted ? "btn-primary" : "btn-secondary"}`}>
            {cta[status]}
          </Link>
        ) : interactive && onOpen ? (
          <button
            type="button"
            className={`w-full ${highlighted ? "btn-primary" : "btn-secondary"}`}
            onClick={() => void onOpen()}
          >
            {cta[status]}
          </button>
        ) : status === "locked" ? (
          <p className="text-xs text-charcoal-soft">Finish the previous step first</p>
        ) : null}
      </div>
    </article>
  );
}
