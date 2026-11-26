import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CardStatus } from "@nivo/shared";
import { ArrowRight, Check, CreditCard, ListChecks, Upload } from "lucide-react";
import { AsyncContent } from "../components/AsyncContent";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DashboardCard } from "../components/DashboardCard";
import { NextStep } from "../components/Page";
import { api, ApiError, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

type CardView = {
  key: string;
  title: string;
  description: string;
  status: CardStatus;
  comingSoon: boolean;
  progress?: { done: number; total: number };
};

type StudentProof = {
  id: string;
  cardKey: string;
  status: "pending" | "approved" | "rejected";
  reviewNote?: string | null;
  createdAt: string;
};

const PROOF_CARD_KEYS = new Set(["blocked_account", "sim"]);

function latestProofByCard(proofs: StudentProof[]): Record<string, StudentProof> {
  const map: Record<string, StudentProof> = {};
  for (const p of proofs) {
    const prev = map[p.cardKey];
    if (!prev || new Date(p.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
      map[p.cardKey] = p;
    }
  }
  return map;
}

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
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);
  const allDone = current === -1;
  const nextLabel = allDone ? null : steps[current]?.label;

  return (
    <div className="mb-5 sm:mb-6" aria-label="Onboarding progress">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-medium text-charcoal sm:text-sm">
          {doneCount}/{steps.length} setup
          <span className="font-normal text-charcoal-soft">
            {allDone ? " · finished" : nextLabel ? ` · next: ${nextLabel}` : ""}
          </span>
        </p>
      </div>

      <ol className="grid grid-cols-5">
        {steps.map((s, i) => {
          const isNext = !allDone && i === current;
          const pending = !s.done && !isNext;
          const leftFilled = Boolean(steps[i - 1]?.done);
          const rightFilled = s.done;

          return (
            <li
              key={s.label}
              className="relative flex min-w-0 flex-col items-center px-0.5"
              title={`${s.label}: ${s.done ? "Done" : isNext ? "Current" : "Pending"}`}
            >
              {/* Half-segments meet under the node; node paints above them */}
              {i > 0 ? (
                <span
                  aria-hidden
                  className={[
                    "absolute left-0 top-3 h-0.5 w-1/2 -translate-y-1/2 sm:top-3.5",
                    leftFilled ? "bg-orange" : "bg-charcoal/10",
                  ].join(" ")}
                />
              ) : null}
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={[
                    "absolute right-0 top-3 h-0.5 w-1/2 -translate-y-1/2 sm:top-3.5",
                    rightFilled ? "bg-orange" : "bg-charcoal/10",
                  ].join(" ")}
                />
              ) : null}

              <span
                className={[
                  "relative inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold sm:h-7 sm:w-7",
                  s.done
                    ? "bg-orange text-white"
                    : isNext
                      ? "bg-saffron text-charcoal ring-2 ring-saffron/35"
                      : "bg-mist text-charcoal-soft",
                ].join(" ")}
              >
                {s.done ? (
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden strokeWidth={2.75} />
                ) : (
                  <span className="font-display leading-none">{i + 1}</span>
                )}
              </span>

              <span
                className={[
                  "relative mt-1.5 w-full text-center text-[10px] font-medium leading-tight sm:text-xs",
                  s.done ? "text-orange-dark" : isNext ? "text-charcoal" : "text-charcoal-soft",
                ].join(" ")}
              >
                {s.label}
              </span>
              <span className="sr-only">
                {s.label}: {s.done ? "completed" : pending ? "pending" : "current"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cards, setCards] = useState<CardView[]>([]);
  const [copy, setCopy] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [proofBusy, setProofBusy] = useState<string>();
  const [proofByCard, setProofByCard] = useState<Record<string, StudentProof>>({});
  const [pendingProofUpload, setPendingProofUpload] = useState<{ cardKey: string; file: File } | null>(null);

  async function reloadCards() {
    const [res, proofsRes] = await Promise.all([
      api.get<{ cards: CardView[] }>("/v1/cards"),
      api.get<{ proofs: StudentProof[] }>("/v1/me/proofs").catch(() => ({ proofs: [] as StudentProof[] })),
    ]);
    setCards(res.cards);
    setProofByCard(latestProofByCard(proofsRes.proofs));
  }

  function requestProofUpload(cardKey: string, file: File | null) {
    if (!file) return;
    if (proofByCard[cardKey]?.status === "pending") {
      setPendingProofUpload({ cardKey, file });
      return;
    }
    void uploadProof(cardKey, file);
  }

  async function uploadProof(cardKey: string, file: File) {
    setProofBusy(cardKey);
    try {
      await uploadFile(`/v1/cards/${cardKey}/proof`, file);
      toast.success("Proof uploaded", "An admin will review it under Proofs.");
      setPendingProofUpload(null);
      await reloadCards();
    } catch (err) {
      toast.error("Could not upload proof", err instanceof ApiError ? err.message : undefined);
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
        const [res, copyRes, proofsRes] = await Promise.all([
          api.get<{ cards: CardView[] }>("/v1/cards"),
          api.get<{ texts: Record<string, string> }>("/v1/copy").catch(() => ({ texts: {} as Record<string, string> })),
          api.get<{ proofs: StudentProof[] }>("/v1/me/proofs").catch(() => ({ proofs: [] as StudentProof[] })),
        ]);
        if (!cancelled) {
          setCards(res.cards);
          setCopy(copyRes.texts ?? {});
          setProofByCard(latestProofByCard(proofsRes.proofs));
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
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-5">
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

      {loaded && !paid && (
        <div className="mt-5">
          <NextStep
            title="Activate your account"
            body="Pay the one-time NIVO fee to unlock your arrival checklist. Stripe may show a local currency."
            action={
              <Link to="/pay" className="btn-primary">
                <CreditCard className="h-4 w-4 shrink-0" aria-hidden />
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
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            }
          />
        </div>
      )}

      <section className="mt-6" aria-labelledby="checklist-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="checklist-title" className="font-display text-sm font-semibold text-charcoal">
              Checklist
            </h2>
            {loaded && cards.length > 0 ? (
              <p className="mt-0.5 text-xs text-charcoal-soft">
                {cards.filter((c) => c.status === "completed").length} of {cards.length} done
                {next ? ` · Focus: ${next.title}` : ""}
              </p>
            ) : null}
          </div>
          <Link to="/documents" className="text-xs font-medium text-orange-dark no-underline hover:underline">
            Document store
          </Link>
        </div>
        <AsyncContent
          ready={loaded}
          error={error}
          empty={cards.length === 0}
          emptyTitle="No checklist items yet"
          emptyDescription="Your arrival path will appear here once your account is set up."
          emptyIcon={ListChecks}
          errorTitle="Couldn’t load your path"
          skeleton="checklist"
          skeletonRows={4}
          className="min-h-[16rem]"
        >
          <div className="grid gap-3 sm:grid-cols-2">
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
                      ? copy["card.sim.locked_helper"] ??
                        "Complete Blocked Account to unlock your SIM."
                      : c.description
                }
                status={c.status}
                to={hrefFor(c.key)}
                ctaLabels={{
                  available: copy["cta.continue"],
                  in_progress: copy["cta.continue"],
                  coming_soon: copy["cta.notify_me"],
                }}
                footer={
                  PROOF_CARD_KEYS.has(c.key) &&
                  (c.status === "available" || c.status === "in_progress") ? (
                    <div className="mt-3 space-y-2 rounded-xl border border-dashed border-charcoal/15 bg-[#FAF8F5]/80 px-3 py-2.5">
                      {proofByCard[c.key]?.status === "pending" ? (
                        <p className="text-xs font-medium text-orange-dark">
                          Proof uploaded — waiting for admin review.
                        </p>
                      ) : null}
                      {proofByCard[c.key]?.status === "rejected" ? (
                        <div className="space-y-1 text-xs">
                          <p className="font-medium text-red-700">Proof was rejected. Upload a clearer file to try again.</p>
                          {proofByCard[c.key]?.reviewNote ? (
                            <p className="rounded-lg bg-red-50 px-2 py-1.5 text-red-900/90">
                              Admin note: {proofByCard[c.key]!.reviewNote}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <label className="flex cursor-pointer flex-col gap-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-charcoal">
                          <Upload className="h-3.5 w-3.5 text-orange-dark" aria-hidden />
                          {proofBusy === c.key
                            ? "Uploading…"
                            : proofByCard[c.key]?.status === "pending"
                              ? "Replace proof (PDF/JPG/PNG)"
                              : "Upload completion proof (PDF/JPG/PNG)"}
                        </span>
                        <input
                          type="file"
                          className="block w-full text-xs text-charcoal-soft file:mr-2 file:rounded-md file:border-0 file:bg-orange/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-orange-dark"
                          accept="image/jpeg,image/png,application/pdf"
                          disabled={proofBusy === c.key}
                          onChange={(e) => {
                            requestProofUpload(c.key, e.target.files?.[0] ?? null);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
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
                              toast.success(
                                res.created
                                  ? copy["card.jobs.notify_toast"] ??
                                      "We’ll email you when Job References launches."
                                  : copy["card.jobs.notify_exists"] ??
                                      "You’re already on the notify list.",
                              ),
                            )
                            .catch((err) =>
                              toast.error(
                                "Could not save notify request",
                                err instanceof ApiError ? err.message : undefined,
                              ),
                            );
                        }
                      : undefined
                }
              />
            ))}
          </div>
        </AsyncContent>
      </section>

      <p className="mt-10 text-xs leading-relaxed text-charcoal-soft">
        {copy["commission.disclosure"] ??
          "Blocked account is with Expatrio; health insurance with Fintiba. NIVO may receive a commission — this does not cost you extra. Your contract is with the partner."}
      </p>

      <ConfirmDialog
        open={pendingProofUpload !== null}
        title="Replace pending proof?"
        description="Your previous upload is still waiting for review. Replacing it sends a new file for admin review."
        confirmLabel="Replace proof"
        busy={Boolean(pendingProofUpload && proofBusy === pendingProofUpload.cardKey)}
        onClose={() => setPendingProofUpload(null)}
        onConfirm={() => {
          if (pendingProofUpload) return uploadProof(pendingProofUpload.cardKey, pendingProofUpload.file);
        }}
      />
    </div>
  );
}
