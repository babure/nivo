import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SERVICE_CURRENCY, SERVICE_FEE_CENTS } from "@nivo/shared";
import { Page } from "../components/Page";
import { Button } from "../components/Button";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

type CheckoutResponse =
  | { mode: "stripe"; url: string }
  | { mode: "simulate"; amountCents: number; currency: string; message: string };

const eurPrice = new Intl.NumberFormat("en", {
  style: "currency",
  currency: SERVICE_CURRENCY.toUpperCase(),
}).format(SERVICE_FEE_CENTS / 100);

export default function Pay() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [immediateStart, setImmediateStart] = useState(false);
  const [simulateReady, setSimulateReady] = useState(false);
  const [banner, setBanner] = useState<string>();
  const [termsVersion, setTermsVersion] = useState("2025-01");
  const [withdrawalVersion, setWithdrawalVersion] = useState("2025-01");

  useEffect(() => {
    if (searchParams.get("payment") === "cancelled" || searchParams.get("payment") === "cancel") {
      setBanner("Checkout cancelled. You can try again when ready.");
      const next = new URLSearchParams(searchParams);
      next.delete("payment");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void api
      .get<{ documents: { slug: string; version: string }[] }>("/v1/legal")
      .then((res) => {
        const terms = res.documents.find((d) => d.slug === "terms");
        const refund = res.documents.find((d) => d.slug === "refund");
        if (terms) setTermsVersion(terms.version);
        if (refund) setWithdrawalVersion(refund.version);
      })
      .catch(() => undefined);
  }, []);

  function consentBody() {
    return {
      termsVersion,
      withdrawalVersion,
      immediateStart: true as const,
    };
  }

  async function checkout() {
    if (!immediateStart) {
      setError("Please confirm that the service may start immediately.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.post<CheckoutResponse>("/v1/payments/checkout", consentBody());
      if (res.mode === "stripe" && res.url) {
        window.location.assign(res.url);
        return;
      }
      if (res.mode === "simulate") {
        setSimulateReady(true);
        return;
      }
      setError("Checkout is not available yet. Try again shortly.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function completeDemoPayment() {
    setBusy(true);
    setError(undefined);
    try {
      await api.post("/v1/payments/simulate", consentBody());
      await refresh();
      navigate("/onboarding/identity", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete demo payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Activate your account"
      intro="One payment unlocks your arrival path. Partner products stay separate."
      narrow
    >
      {banner && (
        <p role="status" className="mb-4 rounded-xl border border-saffron/50 bg-[#FFF6EB] px-3 py-2.5 text-sm">
          {banner}
        </p>
      )}
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white p-5 shadow-[0_8px_24px_rgba(45,42,38,0.06)] sm:p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-orange-dark">NIVO service fee</p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-charcoal tabular-nums">{eurPrice}</p>
          <p className="mt-2 text-sm text-charcoal-soft">
            Listed in euros. Stripe Checkout shows a local amount when Adaptive Pricing applies for your location.
          </p>
        </div>
        <ul className="mt-5 space-y-2 text-sm text-charcoal">
          <li>Student dashboard and arrival checklist</li>
          <li>Encrypted identity onboarding</li>
          <li>Housing request and document vault</li>
        </ul>
        <label className="mt-5 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={immediateStart}
            onChange={(e) => setImmediateStart(e.target.checked)}
          />
          <span>
            I accept the current Terms (v{termsVersion}) and ask NIVO to start the service now (withdrawal policy
            v{withdrawalVersion}).
          </span>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5">
          {!simulateReady ? (
            <Button className="w-full" onClick={() => void checkout()} disabled={busy}>
              {busy ? "Starting…" : `Order with obligation to pay · ${eurPrice}`}
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl border border-charcoal/10 bg-[#F7F4EF] p-4">
              <p className="text-sm">
                Stripe is not configured here. Complete a <strong>demo payment</strong> to continue.
              </p>
              <Button className="w-full" onClick={() => void completeDemoPayment()} disabled={busy}>
                {busy ? "Confirming…" : "Complete payment (demo)"}
              </Button>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-charcoal-soft">Secure Stripe Checkout. See Withdrawal for refund terms.</p>
      </div>
    </Page>
  );
}
