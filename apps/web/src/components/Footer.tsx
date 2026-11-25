import { Link } from "react-router-dom";
import { useConsent } from "../lib/consent";

export const LEGAL_LINKS = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/cookies", label: "Cookies" },
  { to: "/our-role", label: "Our role" },
  { to: "/withdrawal", label: "Withdrawal" },
  { to: "/impressum", label: "Impressum" },
];

export function Footer() {
  const { openSettings } = useConsent();
  return (
    <footer className="border-t border-charcoal/10 bg-white/70">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-[1.4fr_1fr] sm:px-6">
        <div>
          <p className="font-display text-lg font-bold tracking-[0.18em] text-orange">NIVO</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-charcoal-soft">
            A place for new beginnings — clear next steps for students arriving in Germany.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-charcoal">Legal</p>
          <nav aria-label="Legal" className="mt-3 flex flex-wrap gap-x-1 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex min-h-tap items-center px-2 text-sm text-charcoal-soft no-underline hover:text-orange-dark"
              >
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex min-h-tap items-center px-2 text-sm text-charcoal-soft underline underline-offset-4 hover:text-orange-dark"
            >
              Cookie settings
            </button>
          </nav>
        </div>
        <p className="text-xs text-charcoal-soft sm:col-span-2">
          © {new Date().getFullYear()} NIVO. One-time service fee €149; partner costs billed separately.
        </p>
      </div>
    </footer>
  );
}
