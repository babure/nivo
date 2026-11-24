import { useEffect, useState } from "react";
import { Page } from "../../components/Page";
import { api, ApiError } from "../../lib/api";

const SLUG_BY_TITLE: Record<string, "terms" | "privacy" | "refund" | "cookies" | null> = {
  "Terms & Conditions": "terms",
  "Privacy Policy": "privacy",
  "Cookie Policy": "cookies",
  "Right of Withdrawal": "refund",
  Impressum: null,
  "Our Role": null,
};

const STATIC: Record<string, string> = {
  Impressum: `NIVO UG (haftungsbeschränkt)
Berlin, Germany

Represented by the managing directors.
Contact: hello@nivo.example

Register court and commercial register details will be published here after counsel review.
VAT ID (if applicable) will be listed once confirmed with our tax advisor.`,
  "Our Role": `NIVO is a referral and support platform for international students preparing for Germany.

We help you navigate blocked accounts, SIM setup, accommodation introductions and related steps through a guided dashboard.

When you follow a partner link, you leave NIVO and contract directly with that partner. NIVO may receive a commission from partners; this does not increase the price you pay the partner.

NIVO does not provide legal, tax or immigration advice. Always verify requirements with the relevant authorities and institutions.`,
};

function LegalPage({ title }: { title: string }) {
  const slug = SLUG_BY_TITLE[title];
  const [body, setBody] = useState<string>(STATIC[title] ?? "");
  const [version, setVersion] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!slug) return;
    void api
      .get<{ title: string; body: string; version: string }>(`/v1/legal/${slug}`)
      .then((doc) => {
        setBody(doc.body);
        setVersion(doc.version);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not load document.");
      });
  }, [slug]);

  return (
    <Page title={title} intro={version ? `Version ${version}` : undefined}>
      {error && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{error}</p>}
      <article className="surface prose prose-sm max-w-none whitespace-pre-wrap text-charcoal">
        {body || "Loading…"}
      </article>
      <p className="mt-4 text-xs text-charcoal-soft">Draft for counsel review — not final legal advice.</p>
    </Page>
  );
}

export const Terms = () => <LegalPage title="Terms & Conditions" />;
export const Cookies = () => <LegalPage title="Cookie Policy" />;
export const OurRole = () => <LegalPage title="Our Role" />;
export const Privacy = () => <LegalPage title="Privacy Policy" />;
export const Impressum = () => <LegalPage title="Impressum" />;
export const Withdrawal = () => <LegalPage title="Right of Withdrawal" />;
