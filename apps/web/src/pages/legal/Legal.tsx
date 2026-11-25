import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Page } from "../../components/Page";
import { api, ApiError } from "../../lib/api";

type LegalSlug = "terms" | "privacy" | "refund" | "cookies" | "impressum" | "our_role";

const SLUG_BY_TITLE: Record<string, LegalSlug> = {
  "Terms & Conditions": "terms",
  "Privacy Policy": "privacy",
  "Cookie Policy": "cookies",
  "Right of Withdrawal": "refund",
  Impressum: "impressum",
  "Our Role": "our_role",
};

function formatUpdated(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function LegalPage({ title }: { title: string }) {
  const location = useLocation();
  const isDe = location.pathname.startsWith("/de/") || location.pathname === "/de";
  const slug = SLUG_BY_TITLE[title];
  const [body, setBody] = useState<string>("");
  const [version, setVersion] = useState<string>();
  const [publishedAt, setPublishedAt] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!slug) return;
    void api
      .get<{ title: string; body: string; version: string; publishedAt?: string }>(`/v1/legal/${slug}`)
      .then((doc) => {
        setBody(doc.body);
        setVersion(doc.version);
        setPublishedAt(doc.publishedAt);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not load document.");
      });
  }, [slug]);

  const updated = formatUpdated(publishedAt);
  const introParts = [
    version ? `Version ${version}` : null,
    updated ? `Last updated ${updated}` : null,
  ].filter(Boolean);

  return (
    <Page title={title} intro={introParts.length ? introParts.join(" · ") : undefined}>
      {isDe && (
        <p className="mb-4 rounded-lg bg-mist px-3 py-2 text-sm text-charcoal-soft" role="status">
          Deutsche Fassung folgt. English version shown for now.
        </p>
      )}
      {error && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{error}</p>}
      <article className="surface prose prose-sm max-w-none whitespace-pre-wrap text-charcoal">
        {body || "Loading…"}
      </article>
      <p className="mt-4 text-xs text-charcoal-soft">Draft for counsel review — not final legal advice. Replace before go-live.</p>
    </Page>
  );
}

export const Terms = () => <LegalPage title="Terms & Conditions" />;
export const Cookies = () => <LegalPage title="Cookie Policy" />;
export const OurRole = () => <LegalPage title="Our Role" />;
export const Privacy = () => <LegalPage title="Privacy Policy" />;
export const Impressum = () => <LegalPage title="Impressum" />;
export const Withdrawal = () => <LegalPage title="Right of Withdrawal" />;
