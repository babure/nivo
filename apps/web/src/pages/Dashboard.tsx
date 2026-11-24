import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CardStatus } from "@nivo/shared";
import { Page } from "../components/Page";
import { DashboardCard } from "../components/DashboardCard";
import { LinkButton } from "../components/Button";
import { api, ApiError } from "../lib/api";
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

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cards, setCards] = useState<CardView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [notifyMsg, setNotifyMsg] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const payment = searchParams.get("payment");
      const sessionId = searchParams.get("session_id");

      if (payment === "success" && sessionId) {
        try {
          await api.post("/v1/payments/confirm-session", { sessionId });
          if (!cancelled) setBanner("Payment confirmed. Your dashboard is unlocking.");
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
          setError(err instanceof ApiError ? err.message : "Could not load your cards.");
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
  const next = cards.find((c) => c.status === "available");

  return (
    <Page
      title="Your dashboard"
      intro={next ? `Next step: ${next.title}` : "Work through each card at your own pace."}
    >
      {banner && (
        <p role="status" className="surface mb-4 text-sm font-medium text-orange-dark">
          {banner}
        </p>
      )}
      {error && (
        <p role="alert" className="surface mb-4 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {notifyMsg && (
        <p role="status" className="surface mb-4 text-sm">
          {notifyMsg}
        </p>
      )}
      {loaded && !paid && (
        <div className="surface mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Activate your account to unlock your cards.</p>
          <LinkButton to="/pay">Pay €149</LinkButton>
        </div>
      )}
      {loaded && paid && !identityComplete && (
        <div className="surface mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Complete your details to unlock the Blocked Account step.</p>
          <LinkButton to="/onboarding/identity">Continue</LinkButton>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <DashboardCard
            key={c.key}
            title={c.title}
            description={
              c.key === "sim" && c.progress
                ? `${c.description} (${c.progress.done}/${c.progress.total})`
                : c.description
            }
            status={c.status}
            to={hrefFor(c.key)}
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
                      .then(() => api.get<{ cards: CardView[] }>("/v1/cards"))
                      .then((res) => setCards(res.cards))
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
      {loaded && cards.length === 0 && !error && (
        <p className="text-sm text-charcoal-soft">No cards to show yet.</p>
      )}
      <p className="mt-6 text-xs text-charcoal-soft">
        NIVO may receive a commission from partners. This does not cost you extra. You continue on
        the partner’s website; your contract is with the partner.
      </p>
    </Page>
  );
}
