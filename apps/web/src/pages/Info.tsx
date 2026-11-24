import { useState, type FormEvent } from "react";
import { Field, Page } from "../components/Page";
import { Button, LinkButton } from "../components/Button";

export function HowItWorks() {
  const steps = [
    ["Register", "Create your NIVO account and verify your email."],
    ["Activate", "Pay the one-time service fee to unlock your dashboard."],
    ["Verify identity", "Complete a short, secure identity onboarding."],
    ["Get set up", "Work through blocked account, SIM and accommodation cards."],
  ];
  return (
    <Page title="How it works" intro="Four simple steps from sign-up to arrival-ready.">
      <ol className="grid gap-4 sm:grid-cols-2">
        {steps.map(([t, d], i) => (
          <li key={t} className="surface">
            <span className="text-sm font-semibold text-orange-dark">Step {i + 1}</span>
            <h2 className="text-lg font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-charcoal-soft">{d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <LinkButton to="/register">Register</LinkButton>
      </div>
    </Page>
  );
}

export function Services() {
  const items = [
    {
      title: "Blocked account",
      body: "We guide you to open a German Sperrkonto with a trusted partner and track that step on your dashboard.",
    },
    {
      title: "SIM card",
      body: "Once your blocked-account step is done, unlock a German mobile plan through our partner link — with progress shown on your cards.",
    },
    {
      title: "Accommodation",
      body: "Tell us your city, budget and room type. A NIVO accommodation agent follows up and updates your lead status.",
    },
    {
      title: "Job references",
      body: "Coming soon: curated employer introductions. Join the notify list from your dashboard.",
    },
    {
      title: "Identity vault",
      body: "Passport and address details are encrypted at rest. You control what you share with your consultancy.",
    },
    {
      title: "Consultancy tracking",
      body: "If you register with a referral code, your consultancy sees a privacy-aware funnel — never your passport.",
    },
  ];
  return (
    <Page title="Services" intro="What NIVO helps international students set up for Germany.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <article key={s.title} className="surface">
            <h2 className="font-semibold text-charcoal">{s.title}</h2>
            <p className="mt-1 text-sm text-charcoal-soft">{s.body}</p>
          </article>
        ))}
      </div>
    </Page>
  );
}

export function Faq() {
  const items = [
    [
      "Who is NIVO for?",
      "Students moving to Germany who want a clear path for blocked account, SIM, accommodation and related setup — with a single dashboard after a one-time service fee.",
    ],
    [
      "How much does it cost?",
      "NIVO charges a one-time €149 service fee. Partner products (blocked account funding, insurance, SIM plans, rent) are paid to those partners, not to NIVO.",
    ],
    [
      "Is my data safe?",
      "Identity fields are encrypted with AES-256-GCM. Sessions use HttpOnly cookies. Staff access is permission-gated and audited. See our Privacy Policy for details.",
    ],
    [
      "Do I have to use your partners?",
      "Cards open partner links we recommend. Your contract is always with the partner. NIVO may receive a commission; it does not increase your price.",
    ],
    [
      "Can my consultancy see my progress?",
      "Only if you register with their referral code and opt in to share. They see stages and limited contact — never passport or full address.",
    ],
  ];
  return (
    <Page title="FAQ" intro="Answers to common questions.">
      <div className="space-y-3">
        {items.map(([q, a]) => (
          <details key={q} className="surface group">
            <summary className="flex min-h-tap cursor-pointer items-center font-semibold">{q}</summary>
            <p className="mt-2 text-sm text-charcoal-soft">{a}</p>
          </details>
        ))}
      </div>
    </Page>
  );
}

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`NIVO contact from ${name || "website"}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}\n${email}`);
    window.location.href = `mailto:hello@nivo.example?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <Page title="Contact" intro="Questions about onboarding, partners or your account? We’re here to help." narrow>
      {sent ? (
        <p role="status" className="surface text-sm">
          Your email client should open with the message. If it doesn’t, write to{" "}
          <a className="text-orange-dark underline" href="mailto:hello@nivo.example">
            hello@nivo.example
          </a>
          .
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Message">
            <textarea className="input min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full">
            Open email
          </Button>
          <p className="text-xs text-charcoal-soft">
            Prefer chat later? Help will also appear on every signed-in screen once support channels are finalised.
          </p>
        </form>
      )}
    </Page>
  );
}
