import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CardStatus } from "@nivo/shared";
import { DashboardCard } from "../components/DashboardCard";
import { NextStep } from "../components/Page";
import { api, ApiError, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";

type CardView = {
  key: string;
  title: string;
  description: string;
  status: CardStatus;
  comingSoon: boolean;
  progress?: { done: number; total: number };
};

function hrefFor(key: string): string | undefined {
  if (key === "accommodation") return "/accommodation";
  return undefined;
}

function JourneyStepper({
  paid,
  identityComplete,
}: {
  paid: boolean;
  identityComplete: boolean;
}) {
  const steps = [
    { label: "Account", done: true },
    { label: "Verified", done: true },
    { label: "Pay", done: paid },
    { label: "Details", done: identityComplete },
    { label: "Path", done: paid && identityComplete },
  ];
  const current = steps.findIndex((s) => !s.done);
  const active = current === -1 ? steps.length - 1 : current;

  return (
    <div className="mb-8" aria-label="Onboarding progress">
      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <span
            key={s.label}
            className={[
              "h-1.5 flex-1 rounded-full",
              s.done ? "bg-orange" : i === active ? "bg-saffron" : "bg-mist",
            ].join(" ")}
            title={s.label}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-charcoal-soft">
        {active < 2
          ? "You’re set up"
          : !paid
            ? "Next: activate your account"
            : !identityComplete
              ? "Next: finish your details"
              : "Your arrival checklist"}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cards, setCards] = useState<CardView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [notifyMsg, setNotifyMsg] = useState<string>();
  const [proofBusy, setProofBusy] = useState<string>();

  async function reloadCards() {
    const res = await api.get<{ cards: CardView[] }>("/v1/cards");
    setCards(res.cards);
  }

  async function uploadProof(cardKey: string, file: File | null) {
    if (!file) return;
    setProofBusy(cardKey);
    setNotifyMsg(undefined);
    try {
      await uploadFile(`/v1/cards/${cardKey}/proof`, file);
      setNotifyMsg("Proof uploaded — an admin will review it.");
      await reloadCards();
    } catch (err) {
      setNotifyMsg(err instanceof ApiError ? err.message : "Could not upload proof.");
    } finally {
      setProofBusy(undefined);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const payment = searchParams.get("payment");
      const sessionId = searchParams.get("session_id");

      if (payment === "success" && sessionId) {
        try {
          await api.post("/v1/payments/confirm-session", { sessionId });
          if (!cancelled) setBanner("Payment confirmed. Your path is unlocking.");
        } catch (err) {
          if (!cancelled) {
            setBanner(
              err instanceof ApiError
                ? `Payment return: ${err.message}`
                : "Payment return could not be confirmed yet.",
            );
          }
        }
      } else if (payment === "success") {
        if (!cancelled) setBanner("Payment received. Refreshing your account…");
      } else if (payment === "cancelled" || payment === "cancel") {
        if (!cancelled) setBanner("Checkout cancelled. You can try again anytime.");
      }

      if (payment || sessionId) {
        const next = new URLSearchParams(searchParams);
        next.delete("payment");
        next.delete("session_id");
        setSearchParams(next, { replace: true });
      }

      await refresh();
      try {
        const res = await api.get<{ cards: CardView[] }>("/v1/cards");
        if (!cancelled) {
          setCards(res.cards);
          setError(undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load your path.");
          setCards([]);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, searchParams, setSearchParams]);

  const paid = user?.paymentStatus === "paid";
  const identityComplete = user?.identityComplete ?? false;
  const firstName = user?.fullName?.split(/\s+/)[0];
  const next = cards.find((c) => c.status === "available" || c.status === "in_progress");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <JourneyStepper paid={paid} identityComplete={identityComplete} />

      <h1 className="font-display text-xl font-semibold tracking-tight text-charcoal sm:text-2xl">
        {firstName ? `Hi ${firstName}` : "Your path"}
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-charcoal-soft">
        {!paid
          ? "Activate once, then follow your checklist."
          : !identityComplete
            ? "One more step before partner cards unlock."
            : next
              ? `Focus on: ${next.title}`
              : "You’re caught up — review anything below."}
      </p>

      {banner && (
        <p role="status" className="mt-5 rounded-xl border border-saffron/40 bg-[#FFF8F0] px-3 py-2.5 text-sm">
          {banner}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}
      {notifyMsg && (
        <p role="status" className="mt-5 rounded-xl border border-charcoal/10 bg-white px-3 py-2.5 text-sm">
          {notifyMsg}
        </p>
      )}

      {loaded && !paid && (
        <div className="mt-5">
          <NextStep
            title="Activate your account"
            body="Pay the one-time NIVO fee to unlock your arrival checklist. Stripe may show a local currency."
            action={
              <Link to="/pay" className="btn-primary">
                Continue to payment
              </Link>
            }
          />
        </div>
      )}

      {loaded && paid && !identityComplete && (
        <div className="mt-5">
          <NextStep
            title="Finish your details"
            body="Encrypted identity onboarding — needed before blocked account and housing unlock."
            action={
              <Link to="/onboarding/identity" className="btn-primary">
                Continue
              </Link>
            }
          />
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-charcoal/10 bg-white px-4 sm:px-5" aria-labelledby="checklist-title">
        <div className="flex items-baseline justify-between gap-3 border-b border-charcoal/10 py-3">
          <h2 id="checklist-title" className="font-display text-sm font-semibold text-charcoal">
            Checklist
          </h2>
          <Link to="/documents" className="text-xs font-medium text-orange-dark no-underline hover:underline">
            Papers
          </Link>
        </div>
        <div>
          {cards.map((c, i) => (
            <DashboardCard
              key={c.key}
              index={i + 1}
              highlighted={next?.key === c.key && paid && identityComplete}
              title={c.title}
              description={
                c.key === "sim" && c.progress
                  ? `${c.description} (${c.progress.done}/${c.progress.total})`
                  : c.status === "locked" && c.key === "sim"
                    ? "Complete Blocked Account to unlock your SIM."
                    : c.description
              }
              status={c.status}
              to={hrefFor(c.key)}
              footer={
                (c.key === "blocked_account" || c.key === "sim") &&
                (c.status === "available" || c.status === "in_progress") ? (
                  <label className="mt-3 block text-xs text-charcoal-soft">
                    Upload completion proof (PDF/JPG/PNG)
                    <input
                      type="file"
                      className="mt-1 block w-full text-xs"
                      accept="image/jpeg,image/png,application/pdf"
                      disabled={proofBusy === c.key}
                      onChange={(e) => {
                        void uploadProof(c.key, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null
              }
              onOpen={
                c.key === "blocked_account" || c.key === "sim"
                  ? () => {
                      const partner = c.key === "blocked_account" ? "expatrio" : "vodafone";
                      window.open(
                        `${api.baseUrl}/v1/partners/${partner}/go`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                      void api
                        .post(`/v1/cards/${c.key}/status`, { status: "in_progress" })
                        .then(() => reloadCards())
                        .catch(() => undefined);
                    }
                  : c.comingSoon
                    ? () => {
                        void api
                          .post<{ created: boolean }>(`/v1/cards/${c.key}/notify`)
                          .then((res) =>
                            setNotifyMsg(
                              res.created
                                ? "We’ll email you when Job References launches."
                                : "You’re already on the notify list.",
                            ),
                          )
                          .catch((err) =>
                            setNotifyMsg(err instanceof ApiError ? err.message : "Could not save notify request."),
                          );
                      }
                    : undefined
              }
            />
          ))}
        </div>
      </section>

      {loaded && cards.length === 0 && !error && (
        <p className="mt-6 text-sm text-charcoal-soft">No checklist items yet.</p>
      )}

      <p className="mt-10 text-xs leading-relaxed text-charcoal-soft">
        NIVO may receive a commission from partners. This does not cost you extra. Your contract is with the partner.
      </p>
    </div>
  );
}
