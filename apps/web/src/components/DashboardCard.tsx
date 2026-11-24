import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CardStatus } from "@nivo/shared";
import { CardStatusTag } from "./CardStatusTag";

type Props = {
  title: string;
  description: string;
  status: CardStatus;
  to?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  onOpen?: () => void | Promise<void>;
};

const CTA: Record<CardStatus, string> = {
  locked: "Locked",
  available: "Open",
  in_progress: "Continue",
  completed: "View",
  coming_soon: "Notify me",
};

export function DashboardCard({ title, description, status, to, icon, footer, onOpen }: Props) {
  const canAct =
    status === "available" || status === "in_progress" || status === "completed" || status === "coming_soon";
  const interactive = canAct && (!!to || !!onOpen);
  return (
    <article
      data-testid="dashboard-card"
      className={`surface flex flex-col gap-3 ${status === "locked" ? "opacity-80" : ""}`}
      aria-disabled={status === "locked"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-saffron/30 text-xl" aria-hidden>
              {icon}
            </span>
          )}
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <CardStatusTag status={status} />
      </div>
      <p className="text-sm text-charcoal-soft">{description}</p>
      {footer}
      <div className="mt-auto pt-2">
        {interactive && to ? (
          <Link to={to} className="btn-primary w-full sm:w-auto">
            {CTA[status]}
          </Link>
        ) : interactive && onOpen ? (
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => void onOpen()}>
            {CTA[status]}
          </button>
        ) : (
          <span className="btn-secondary w-full cursor-not-allowed opacity-60 sm:w-auto" aria-hidden>
            {CTA[status]}
          </span>
        )}
      </div>
    </article>
  );
}
