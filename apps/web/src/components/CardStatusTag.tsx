import type { CardStatus } from "@nivo/shared";

const STYLES: Record<CardStatus, { label: string; className: string }> = {
  locked: { label: "Locked", className: "bg-charcoal/10 text-charcoal" },
  available: { label: "Available", className: "bg-orange/15 text-orange-dark" },
  in_progress: { label: "In progress", className: "bg-saffron/30 text-charcoal" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800" },
  coming_soon: { label: "Coming soon", className: "border border-charcoal/20 text-charcoal-soft" },
};

export function CardStatusTag({ status }: { status: CardStatus }) {
  const s = STYLES[status];
  return (
    <span
      data-status={status}
      className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-semibold ${s.className}`}
    >
      {s.label}
    </span>
  );
}
