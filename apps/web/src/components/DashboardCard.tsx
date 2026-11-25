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
}: Props) {
  const canAct =
    status === "available" || status === "in_progress" || status === "completed" || status === "coming_soon";
  const interactive = canAct && (!!to || !!onOpen);

  return (
    <article
      data-testid="dashboard-card"
      className={[
        "border-b border-charcoal/10 py-5 first:pt-0 last:border-b-0",
        status === "locked" ? "opacity-60" : "",
        highlighted ? "relative" : "",
      ].join(" ")}
      aria-disabled={status === "locked"}
    >
      {highlighted && (
        <span aria-hidden className="absolute -left-4 top-5 bottom-5 w-1 rounded-full bg-orange sm:-left-6" />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {typeof index === "number" && (
              <span className="font-display text-sm font-semibold text-charcoal-soft">{String(index).padStart(2, "0")}</span>
            )}
            <CardStatusTag status={status} />
          </div>
          <h3 className="font-display mt-2 text-lg font-semibold tracking-tight text-charcoal">{title}</h3>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-charcoal-soft">{description}</p>
          {footer}
        </div>
        <div className="shrink-0">
          {interactive && to ? (
            <Link to={to} className={highlighted ? "btn-primary" : "btn-secondary"}>
              {CTA[status]}
            </Link>
          ) : interactive && onOpen ? (
            <button
              type="button"
              className={highlighted ? "btn-primary" : "btn-secondary"}
              onClick={() => void onOpen()}
            >
              {CTA[status]}
            </button>
          ) : status === "locked" ? (
            <p className="max-w-[10rem] text-right text-xs text-charcoal-soft">Finish the previous step first</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
