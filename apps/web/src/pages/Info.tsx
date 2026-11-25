import { useState, type FormEvent } from "react";
import { Field, Page } from "../components/Page";
import { Button, LinkButton } from "../components/Button";

export function HowItWorks() {
  const steps = [
    [
      "Sign up and complete your profile",
      "Create your NIVO account in minutes, verify your email, and pay the one-time €149 service fee to unlock your dashboard.",
    ],
    [
      "Set up your blocked account",
      "Follow the guided Sperrkonto partner path and receive the confirmation you need for your visa — tracked as a card on your dashboard.",
    ],
    [
      "Arrive and activate",
      "Land in Germany with SIM unlock and housing next steps ready. Partner bank or insurance guidance is available when you need it — not as live bundled products in Phase 1.",
    ],
    [
      "Find accommodation & settle in",
      "Submit city, budget and room type; a NIVO agent follows up. Student support stays available; Job References are coming soon.",
    ],
  ];
  return (
    <Page title="How It Works" intro="Your journey to Germany — clear steps from sign-up to settling in.">
      <ol className="grid gap-4 sm:grid-cols-2">
        {steps.map(([t, d], i) => (
          <li key={t} className="surface">
            <span className="text-sm font-semibold text-orange-dark">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="text-lg font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-charcoal-soft">{d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <LinkButton to="/register">Get Started</LinkButton>
      </div>
    </Page>
  );
}

export function Services() {
  const items = [
    {
      title: "Blocked Account",
      body: "Visa-required Sperrkonto guidance: €11,904 secured, €992 released monthly through a partner. NIVO tracks the step; partner fees are separate from the €149 NIVO fee.",
    },
    {
      title: "Accommodation",
      body: "Verified student-housing leads in major German cities. Share preferences; NIVO follows up and updates your lead status.",
    },
    {
      title: "SIM Card",
      body: "Unlock a German SIM once your blocked-account card is complete — progress stays visible on your dashboard.",
    },
    {
      title: "Job References",
      body: "Coming soon: curated part-time and full-time introductions through our partner network.",
    },
    {
      title: "Student Support",
      body: "Help with questions about arriving and living in Germany, whenever you need a clear next step.",
    },
    {
      title: "Bank & insurance (partner journey)",
      body: "Guidance toward partner bank and health-insurance options when you need them. Not sold as live NIVO products in this release.",
    },
  ];
  return (
    <Page title="Services" intro="Everything you need to start student life in Germany — in one place.">
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
      "What is a blocked account and why do I need it?",
      "A Sperrkonto (blocked account) is usually required for a German student visa. You deposit funds that are released monthly. NIVO guides you through a partner path and tracks completion — the deposit and partner fees are paid to the partner, not as part of the €149 NIVO fee.",
    ],
    [
      "How long does the setup take?",
      "Creating a NIVO account and verifying email takes minutes. Paying the €149 fee unlocks your dashboard. Partner steps (blocked account, SIM, housing) depend on the partner and your documents.",
    ],
    [
      "Can I use NIVO before I arrive in Germany?",
      "Yes. Most of the journey is designed for pre-arrival: account, payment, identity onboarding, blocked-account guidance, and housing leads before you land.",
    ],
    [
      "Which cities do you provide accommodation in?",
      "We take leads for major German student cities. Availability depends on local inventory; a NIVO agent follows up after you submit city, budget and room type.",
    ],
    [
      "How do I get my SIM card and bank account?",
      "SIM unlocks on your dashboard after the blocked-account step. Bank and insurance are partner journeys you can follow when ready — contracts are with those partners, not NIVO.",
    ],
    [
      "How much does NIVO cost?",
      "NIVO charges a one-time €149 service fee. Partner products (blocked-account funding, SIM plans, rent, insurance) are billed by partners separately.",
    ],
  ];
  return (
    <Page title="FAQ" intro="Frequently asked questions about starting with NIVO.">
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
    window.location.href = `mailto:hello@nivo.demo?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <Page title="Contact" intro="Questions about onboarding, partners or your account? We’re here to help." narrow>
      {sent ? (
        <p role="status" className="surface text-sm">
          Your email client should open with the message. If it doesn’t, write to{" "}
          <a className="text-orange-dark underline" href="mailto:hello@nivo.demo">
            hello@nivo.demo
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
        </form>
      )}
    </Page>
  );
}
