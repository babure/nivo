/** Compact path-card status for dense admin tables. */

const PATH_KEYS = [
  { key: "blocked_account", short: "BA", label: "Blocked account" },
  { key: "sim", short: "SIM", label: "SIM" },
  { key: "accommodation", short: "HO", label: "Housing" },
] as const;

type PathKey = (typeof PATH_KEYS)[number]["key"];

type Cards = Partial<Record<PathKey, string>>;

function statusMeta(status: string | undefined) {
  switch (status) {
    case "completed":
      return { dot: "bg-emerald-500", text: "text-emerald-800", word: "Done" };
    case "in_progress":
      return { dot: "bg-amber-500", text: "text-amber-900", word: "Active" };
    case "available":
      return { dot: "bg-orange", text: "text-orange-dark", word: "Ready" };
    case "coming_soon":
      return { dot: "bg-charcoal/25", text: "text-charcoal-soft", word: "Soon" };
    case "locked":
    default:
      return { dot: "bg-charcoal/20", text: "text-charcoal-soft", word: status ? "Locked" : "—" };
  }
}

export function PathStatusStrip({ cards }: { cards?: Cards | null }) {
  if (!cards) {
    return <span className="text-xs text-charcoal-soft">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="Path card status">
      {PATH_KEYS.map(({ key, short, label }) => {
        const status = cards[key];
        const meta = statusMeta(status);
        const title = `${label}: ${status ? status.replaceAll("_", " ") : "unknown"}`;
        return (
          <span
            key={key}
            role="listitem"
            title={title}
            className={`inline-flex items-center gap-1 rounded-md bg-mist/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${meta.text}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
            <span>{short}</span>
            <span className="font-medium opacity-80">{meta.word}</span>
          </span>
        );
      })}
    </div>
  );
}

export { PATH_KEYS };
