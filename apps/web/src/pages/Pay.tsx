import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SERVICE_CURRENCY, SERVICE_FEE_CENTS } from "@nivo/shared";
import { Page } from "../components/Page";
import { CreditCard } from "lucide-react";
import { Button } from "../components/Button";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

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
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [immediateStart, setImmediateStart] = useState(false);
  const [simulateReady, setSimulateReady] = useState(false);
  const [termsVersion, setTermsVersion] = useState("2025-01");
  const [withdrawalVersion, setWithdrawalVersion] = useState("2025-01");

  useEffect(() => {
    if (searchParams.get("payment") === "cancelled" || searchParams.get("payment") === "cancel") {
      toast.info("Checkout cancelled", "You can try again when ready.");
      const next = new URLSearchParams(searchParams);
      next.delete("payment");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

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
      toast.error("Please confirm that the service may start immediately");
      return;
    }
    setBusy(true);
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
      toast.error("Checkout is not available yet", "Try again shortly.");
    } catch (err) {
      toast.error("Could not start checkout", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function completeDemoPayment() {
    setBusy(true);
    try {
      await api.post("/v1/payments/simulate", consentBody());
      await refresh();
      navigate("/onboarding/identity", { replace: true });
    } catch (err) {
      toast.error("Could not complete demo payment", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Activate your account"
      intro="One payment unlocks your arrival path. Partner products stay separate."
      wide
      compact
    >
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
        <div className="mt-5">
          {!simulateReady ? (
            <Button className="w-full" onClick={() => void checkout()} disabled={busy}>
              <CreditCard className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "Starting…" : `Order with obligation to pay · ${eurPrice}`}
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl border border-charcoal/10 bg-[#F7F4EF] p-4">
              <p className="text-sm">
                Stripe is not configured here. Complete a <strong>demo payment</strong> to continue.
              </p>
              <Button className="w-full" onClick={() => void completeDemoPayment()} disabled={busy}>
                <CreditCard className="h-4 w-4 shrink-0" aria-hidden />
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
