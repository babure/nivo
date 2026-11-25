import type { CardStatus } from "@nivo/shared";

const STYLES: Record<CardStatus, { label: string; className: string }> = {
  locked: { label: "Locked", className: "bg-mist text-charcoal-soft" },
  available: { label: "Ready", className: "bg-[#FFF0E0] text-[#9A4E00]" },
  in_progress: { label: "In progress", className: "bg-[#FFF0E0] text-[#9A4E00]" },
  completed: { label: "Done", className: "bg-[#E4F3E7] text-[#2F6B3A]" },
  coming_soon: { label: "Soon", className: "bg-mist text-charcoal-soft" },
};

export function CardStatusTag({ status }: { status: CardStatus }) {
  const s = STYLES[status];
  return (
    <span data-status={status} className={`status-pill ${s.className}`}>
      {s.label}
    </span>
  );
}
