import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { resolvePostLoginPath } from "../lib/navigation";
import { useToast } from "../lib/toast";

type Props = {
  next?: string;
  referralCode?: string;
  shareProgressWithConsultancy?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  requireTerms?: boolean;
  termsAccepted?: boolean;
};

type TokenClient = {
  requestAccessToken: (override?: { prompt?: string }) => void;
};

type GoogleOauth = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        callback: (res: { access_token?: string; error?: string }) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleOauth;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.dataset.gis = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS load failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function GoogleSignInButton({
  next,
  referralCode,
  shareProgressWithConsultancy,
  termsVersion,
  privacyVersion,
  requireTerms,
  termsAccepted,
}: Props) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const clientRef = useRef<TokenClient | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const blocked = Boolean(requireTerms && !termsAccepted);

  const finishLogin = useCallback(
    async (accessToken: string) => {
      setBusy(true);
      try {
        await api.post("/v1/auth/google", {
          accessToken,
          ref: referralCode,
          terms: termsVersion,
          privacy: privacyVersion,
          shareProgressWithConsultancy: shareProgressWithConsultancy === true,
        });
        const me = await refresh();
        if (!me) throw new ApiError(401, "UNAUTHORIZED", "Could not load your session.");
        navigate(resolvePostLoginPath(me, next), { replace: true });
      } catch (err) {
        toast.error("Google sign-in failed", err instanceof ApiError ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    },
    [navigate, next, privacyVersion, referralCode, refresh, shareProgressWithConsultancy, termsVersion, toast],
  );

  useEffect(() => {
    void api
      .get<{ enabled: boolean; clientId: string | null }>("/v1/auth/google/status")
      .then((r) => {
        setEnabled(r.enabled);
        setClientId(r.clientId);
      })
      .catch(() => setEnabled(true));
  }, []);

  useEffect(() => {
    if (!enabled || !clientId) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadGis();
        if (cancelled || !window.google) return;
        clientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: (res) => {
            if (res.error || !res.access_token) {
              toast.error("Google sign-in was cancelled");
              setBusy(false);
              return;
            }
            void finishLogin(res.access_token);
          },
          error_callback: () => {
            toast.error("Google sign-in failed", "Try again.");
            setBusy(false);
          },
        });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) toast.error("Could not load Google sign-in");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, enabled, finishLogin, toast]);

  function onClick() {
    if (blocked || busy || !clientRef.current) return;
    setBusy(true);
    clientRef.current.requestAccessToken({ prompt: "select_account" });
  }

  if (!enabled) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={blocked || busy || !ready}
        onClick={onClick}
      >
        <GoogleMark />
        {busy ? "Signing in…" : "Continue with Google"}
      </button>
      {blocked ? (
        <p className="text-center text-xs text-charcoal-soft">Accept age + terms above to continue with Google.</p>
      ) : null}
      <div className="relative flex items-center gap-3 text-xs text-charcoal-soft">
        <span className="h-px flex-1 bg-charcoal/15" />
        or continue with email
        <span className="h-px flex-1 bg-charcoal/15" />
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
