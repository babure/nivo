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

export default function Pay() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [immediateStart, setImmediateStart] = useState(false);
  const [simulateReady, setSimulateReady] = useState(false);
  const [banner, setBanner] = useState<string>();

  useEffect(() => {
    if (searchParams.get("payment") === "cancelled" || searchParams.get("payment") === "cancel") {
      setBanner("Checkout cancelled. You can try again when ready.");
      const next = new URLSearchParams(searchParams);
      next.delete("payment");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const price = new Intl.NumberFormat("en", {
    style: "currency",
    currency: SERVICE_CURRENCY.toUpperCase(),
  }).format(SERVICE_FEE_CENTS / 100);

  async function checkout() {
    if (!immediateStart) {
      setError("Please confirm that the service may start immediately.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.post<CheckoutResponse>("/v1/payments/checkout");
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
      await api.post("/v1/payments/simulate");
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
      title="Pay €149 once"
      intro="This unlocks your dashboard. Partner products (blocked account, insurance, SIM) are charged by partners separately."
      narrow
    >
      {banner && (
        <p role="status" className="mb-4 text-sm font-medium text-orange-dark">
          {banner}
        </p>
      )}
      <div className="surface space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">NIVO service fee</span>
          <span className="text-2xl font-bold text-orange-dark">{price}</span>
        </div>
        <p className="text-sm text-charcoal-soft">
          One-time fee for NIVO’s referral and support. Final VAT presentation will match counsel
          guidance before go-live; the amount charged is {price}.
        </p>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={immediateStart}
            onChange={(e) => setImmediateStart(e.target.checked)}
          />
          <span>I ask NIVO to start the service now (this affects my right of withdrawal).</span>
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {!simulateReady ? (
          <Button className="w-full" onClick={() => void checkout()} disabled={busy}>
            {busy ? "Starting…" : "Order with obligation to pay"}
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl border border-orange/30 bg-beige/50 p-4">
            <p className="text-sm">
              Stripe is not configured in this environment. Complete a <strong>demo payment</strong>{" "}
              to continue the student journey.
            </p>
            <Button className="w-full" onClick={() => void completeDemoPayment()} disabled={busy}>
              {busy ? "Confirming…" : "Complete payment (demo)"}
            </Button>
          </div>
        )}
        <p className="text-xs text-charcoal-soft">
          Production uses secure Stripe Checkout hosted for NIVO. See Withdrawal for refund terms.
        </p>
      </div>
    </Page>
  );
}
