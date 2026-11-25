import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ConsentChoice = "all" | "essential" | "custom";

export type ConsentState = {
  choice: ConsentChoice;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
};

const KEY = "nivo.cookie-consent";

function read(): ConsentState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ConsentState) : null;
  } catch {
    return null;
  }
}

type ConsentContextValue = {
  consent: ConsentState | null;
  bannerOpen: boolean;
  openSettings: () => void;
  closeBanner: () => void;
  save: (choice: ConsentChoice, prefs?: { analytics: boolean; marketing: boolean }) => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(read);
  const [bannerOpen, setBannerOpen] = useState(() => read() === null);

  const save = useCallback<ConsentContextValue["save"]>((choice, prefs) => {
    const next: ConsentState = {
      choice,
      analytics: choice === "all" ? true : choice === "essential" ? false : !!prefs?.analytics,
      marketing: choice === "all" ? true : choice === "essential" ? false : !!prefs?.marketing,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(next));
    // Mirror to cookie for server-side / TDDDG inventory alignment (__Host-nivo_consent in prod hosts).
    try {
      const secure = typeof location !== "undefined" && location.protocol === "https:";
      const name = secure ? "__Host-nivo_consent" : "nivo_consent";
      document.cookie = `${name}=${encodeURIComponent(JSON.stringify({ choice: next.choice, analytics: next.analytics, marketing: next.marketing }))}; Path=/; SameSite=Lax; Max-Age=31536000${secure ? "; Secure" : ""}`;
    } catch {
      /* ignore cookie failures */
    }
    setConsent(next);
    setBannerOpen(false);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      bannerOpen,
      openSettings: () => setBannerOpen(true),
      closeBanner: () => setBannerOpen(false),
      save,
    }),
    [consent, bannerOpen, save],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used inside <ConsentProvider>");
  return ctx;
}
