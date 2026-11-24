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
    <footer className="border-t border-charcoal/10 bg-beige/70">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6">
        <p className="text-lg font-bold tracking-widest text-orange">NIVO</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-2 gap-y-1">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="inline-flex min-h-tap items-center px-2 text-sm hover:text-orange-dark">
              {l.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={openSettings}
            className="inline-flex min-h-tap items-center px-2 text-sm underline underline-offset-4 hover:text-orange-dark"
          >
            Cookie settings
          </button>
        </nav>
        <p className="text-xs text-charcoal-soft">© {new Date().getFullYear()} NIVO. All rights reserved.</p>
      </div>
    </footer>
  );
}
