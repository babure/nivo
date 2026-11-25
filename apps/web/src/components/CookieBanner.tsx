import { useState } from "react";
import { Link } from "react-router-dom";
import { useConsent } from "../lib/consent";

// All three actions share one style so none is visually favoured.
const ACTION = "btn-secondary w-full";

export function CookieBanner() {
  const { bannerOpen, consent, save, closeBanner } = useConsent();
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);
  const [marketing, setMarketing] = useState(consent?.marketing ?? false);

  if (!bannerOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookies"
      className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-charcoal/10 bg-white p-4 shadow-xl sm:p-5">
        <h2 className="text-base font-semibold">Cookies</h2>
        <p className="mt-1 text-sm text-charcoal-soft">
          We use essential cookies to run NIVO. With your permission we also use optional cookies to improve it. See our{" "}
          <Link to="/cookies" className="font-medium text-orange-dark underline">
            Cookie policy
          </Link>
          .
        </p>

        {showSettings && (
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Cookie preferences</legend>
            <label className="flex min-h-tap items-center gap-3 text-sm">
              <input type="checkbox" checked disabled className="h-5 w-5 accent-orange" />
              Essential (always on)
            </label>
            <label className="flex min-h-tap items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-orange"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              Analytics
            </label>
            <label className="flex min-h-tap items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-orange"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
              />
              Marketing
            </label>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => save("custom", { analytics, marketing })}
            >
              Save preferences
            </button>
          </fieldset>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button type="button" className={ACTION} onClick={() => save("all")}>
            Accept all
          </button>
          <button type="button" className={ACTION} onClick={() => save("essential")}>
            Reject non-essential
          </button>
          <button
            type="button"
            className={ACTION}
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
          >
            Settings
          </button>
        </div>
        {consent && (
          <button type="button" className="mt-2 min-h-tap text-sm text-charcoal-soft underline" onClick={closeBanner}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
