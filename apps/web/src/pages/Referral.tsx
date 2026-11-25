import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Link2 } from "lucide-react";
import { Button } from "../components/Button";
import { Page } from "../components/Page";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { homePathFor } from "../lib/navigation";
import { useToast } from "../lib/toast";

type Lookup =
  | { valid: false }
  | { valid: true; id: string; name: string; code: string; link: string };

/** /r/:code — join via referral; works for guests and signed-in students. */
export default function Referral() {
  const { code = "" } = useParams();
  const trimmed = code.trim();
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!trimmed) {
      setLookup({ valid: false });
      return;
    }
    let cancelled = false;
    void api
      .get<Lookup>(`/v1/consultancy/lookup?code=${encodeURIComponent(trimmed)}`)
      .then((res) => {
        if (!cancelled) setLookup(res);
      })
      .catch(() => {
        if (!cancelled) setLookup({ valid: false });
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed]);

  if (!ready || lookup === null) {
    return <p className="p-8 text-center text-sm text-charcoal-soft">Checking referral…</p>;
  }

  if (!trimmed || !lookup.valid) {
    return (
      <Page title="Invalid referral" intro="That join code is not recognised." narrow>
        <p className="text-sm text-charcoal-soft">Ask your consultancy for a fresh link, or create an account without a code.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link to="/register" className="btn-primary text-center">
            Create account
          </Link>
          <Link to="/" className="btn-secondary text-center">
            Home
          </Link>
        </div>
      </Page>
    );
  }

  if (user?.role === "admin" || user?.role === "consultancy") {
    return <Navigate to={homePathFor(user)} replace />;
  }

  if (user?.role === "student") {
    const student = user;
    const orgCode = lookup.code;
    const orgName = lookup.name;

    async function apply() {
      setBusy(true);
      try {
        const res = await api.post<{
          attributed: boolean;
          organisation: { name: string } | null;
        }>("/v1/me/referral", {
          code: orgCode,
          shareProgressWithConsultancy: share,
        });
        toast.success(
          res.organisation ? `Linked with ${res.organisation.name}` : "Referral applied",
        );
        setDone(true);
        window.setTimeout(() => navigate(homePathFor(student), { replace: true }), 1200);
      } catch (err) {
        toast.error("Could not apply this referral", err instanceof ApiError ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    }

    return (
      <Page title="Join with referral" intro={`Link your NIVO account with ${orgName}.`} narrow>
        {done ? (
          <p role="status" className="text-sm font-medium text-orange-dark">
            Redirecting…
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-charcoal-soft">
              Code <span className="font-mono font-medium text-charcoal">{orgCode}</span>
            </p>
            <label className="flex min-h-tap items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-orange"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
              />
              <span>Share my progress (email/phone) with this consultancy.</span>
            </label>
            <Button type="button" className="w-full" disabled={busy} onClick={() => void apply()}>
              <Link2 className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "Linking…" : "Link my account"}
            </Button>
            <p className="text-center text-sm">
              <Link to={homePathFor(student)} className="text-orange-dark underline">
                Skip for now
              </Link>
            </p>
          </div>
        )}
      </Page>
    );
  }

  return (
    <Navigate
      to={`/register?ref=${encodeURIComponent(lookup.code)}`}
      replace
    />
  );
}
