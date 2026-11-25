import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { Field } from "../components/Page";
import { Button, LinkButton } from "../components/Button";
import { useAuth } from "../lib/auth";
import { homePathFor } from "../lib/navigation";

const PATH_ITEMS = [
  {
    title: "Blocked account",
    body: "Guided Sperrkonto with a trusted partner. Partner fees stay with the partner.",
  },
  {
    title: "Housing",
    body: "Share city, budget and room type. A NIVO agent follows up with student housing leads.",
  },
  {
    title: "German SIM",
    body: "Unlocks on your checklist after the blocked-account step is complete.",
  },
  {
    title: "Student support",
    body: "Calm next steps for arriving and settling — jobs coming later.",
  },
];

const JOURNEY = [
  {
    title: "Create your account",
    body: "Sign up, verify email, pay the one-time €149 NIVO fee.",
  },
  {
    title: "Share your details",
    body: "Encrypted identity onboarding unlocks partner cards.",
  },
  {
    title: "Follow your checklist",
    body: "Blocked account, SIM and housing — one clear next step at a time.",
  },
  {
    title: "Arrive ready",
    body: "Land in Germany with papers and housing already moving.",
  },
];

const FAQ = [
  [
    "What is a blocked account?",
    "A Sperrkonto is usually required for a German student visa. You deposit funds that are released monthly. NIVO guides a partner path and tracks completion — the deposit is paid to the partner, not as part of the €149 NIVO fee.",
  ],
  [
    "How long does setup take?",
    "Account and email verification take minutes. Paying €149 unlocks your path. Partner steps depend on documents and the partner.",
  ],
  [
    "Can I start before I arrive?",
    "Yes. Most of the journey is pre-arrival: account, payment, identity, blocked-account guidance, and housing leads.",
  ],
  [
    "How much does NIVO cost?",
    "One-time €149 for NIVO’s referral and support. Partner products (Sperrkonto, SIM, rent) are billed by partners separately.",
  ],
] as const;

function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home() {
  const { user } = useAuth();
  const location = useLocation();
  const ctaTo = user ? homePathFor(user) : "/register";
  const ctaLabel = user
    ? user.role === "admin" || user.role === "consultancy"
      ? "Open workspace"
      : user.paymentStatus === "paid"
        ? "Open your path"
        : "Continue activation"
    : "Start your journey";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (location.hash) requestAnimationFrame(() => scrollToHash(location.hash));
  }, [location.hash]);

  function onContact(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`NIVO contact from ${name || "website"}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}\n${email}`);
    window.location.href = `mailto:hello@nivo.demo?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <div>
      {/* Hero: brand-first, full-bleed horizon — one composition */}
      <section
        aria-labelledby="hero-headline"
        className="relative overflow-hidden"
        style={{ minHeight: "min(92vh, 54rem)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-horizon-shift"
          style={{
            backgroundImage:
              "linear-gradient(115deg, #1C1A17 0%, #2A241C 38%, #5A3A18 68%, #FB770B 100%)",
            backgroundSize: "140% 140%",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 70% 110%, rgb(232 165 92 / 0.55), transparent 55%), linear-gradient(180deg, transparent 55%, rgb(28 26 23 / 0.55) 100%)",
          }}
        />
        {/* Soft city silhouette as atmosphere, not a card */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-black/25 sm:h-52"
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            d="M0 200V120h40v-40h20v40h30V80h25v40h50V60h40v60h35V90h20v50h60V40h45v80h55V70h30v70h80V50h50v90h70V30h60v110h90V80h40v60h100V100h35v40h120V90h50v50h120v60H0z"
          />
        </svg>

        <div className="relative mx-auto flex max-w-5xl flex-col justify-end px-5 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-36">
          <p
            data-testid="brand"
            className="font-display animate-rise-in text-[clamp(3.5rem,16vw,8.5rem)] font-extrabold leading-[0.88] tracking-[0.06em] text-white"
          >
            NIVO
          </p>
          <h1
            id="hero-headline"
            className="font-display mt-5 max-w-xl animate-rise-in text-2xl font-semibold leading-snug text-white sm:text-4xl"
            style={{ animationDelay: "80ms" }}
          >
            A place for new beginnings
          </h1>
          <p
            className="mt-4 max-w-md animate-rise-in text-base leading-relaxed text-white/80 sm:text-lg"
            style={{ animationDelay: "140ms" }}
          >
            Everything you need to start student life in Germany — blocked account, housing, SIM, and support.
          </p>
          <div
            className="mt-8 flex animate-rise-in flex-col gap-3 sm:flex-row sm:items-center"
            style={{ animationDelay: "200ms" }}
          >
            <Link
              to={ctaTo}
              className="btn inline-flex min-h-tap items-center justify-center rounded-xl bg-white px-8 text-[0.95rem] font-semibold text-charcoal no-underline hover:bg-paper"
            >
              {ctaLabel}
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-tap items-center justify-center rounded-xl border border-white/35 px-6 text-[0.95rem] font-semibold text-white no-underline hover:bg-white/10"
              onClick={(e) => {
                e.preventDefault();
                scrollToHash("#how-it-works");
                history.replaceState(null, "", "#how-it-works");
              }}
            >
              See how it works
            </a>
          </div>
          <p className="mt-6 animate-rise-in text-sm text-white/65" style={{ animationDelay: "260ms" }}>
            One-time NIVO fee €149 · partner costs billed separately
          </p>
        </div>
      </section>

      <section id="path" className="scroll-mt-24 border-b border-charcoal/8 bg-white py-20" aria-labelledby="path-title">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <h2 id="path-title" className="font-display text-3xl font-semibold tracking-tight text-charcoal">
            Your arrival path
          </h2>
          <p className="mt-3 max-w-prose text-charcoal-soft">
            We handle the bureaucracy so you can focus on studying. Bank and insurance stay partner journeys — not sold
            as live NIVO products in this release.
          </p>
          <ul className="mt-12 divide-y divide-charcoal/10 border-y border-charcoal/10">
            {PATH_ITEMS.map((item) => (
              <li key={item.title} className="grid gap-2 py-6 sm:grid-cols-[14rem_1fr] sm:gap-8">
                <h3 className="font-display text-lg font-semibold text-charcoal">{item.title}</h3>
                <p className="max-w-prose text-sm leading-relaxed text-charcoal-soft sm:text-base">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 py-20" aria-labelledby="journey-title">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <h2 id="journey-title" className="font-display text-3xl font-semibold tracking-tight">
            How it works
          </h2>
          <p className="mt-2 max-w-prose text-charcoal-soft">Four steps from signup to landing ready.</p>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {JOURNEY.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="font-display text-4xl font-bold text-orange/25">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-display text-lg font-semibold text-charcoal">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 border-y border-charcoal/8 bg-white py-20" aria-labelledby="faq-title">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <h2 id="faq-title" className="font-display text-3xl font-semibold tracking-tight">
            Questions
          </h2>
          <div className="mt-10 max-w-3xl divide-y divide-charcoal/10 border-y border-charcoal/10">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-4 font-medium text-charcoal">
                  {q}
                  <span className="text-orange transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-prose text-sm leading-relaxed text-charcoal-soft">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-24 py-20" aria-labelledby="about-title">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <h2 id="about-title" className="font-display text-3xl font-semibold tracking-tight">
            Talk to us
          </h2>
          <p className="mt-2 max-w-prose text-charcoal-soft">
            Questions about onboarding, partners or your account? Write to us.
          </p>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div className="space-y-4 text-sm leading-relaxed text-charcoal-soft">
              <p>
                NIVO introduces you to partners for blocked account, SIM and housing. We never hold your money for
                partner services.
              </p>
              <p>
                <a className="font-medium text-orange-dark no-underline hover:underline" href="mailto:hello@nivo.demo">
                  hello@nivo.demo
                </a>
              </p>
            </div>
            <div>
              {sent ? (
                <p role="status" className="text-sm text-charcoal-soft">
                  Your email app should open. If not, write to{" "}
                  <a className="text-orange-dark underline" href="mailto:hello@nivo.demo">
                    hello@nivo.demo
                  </a>
                  .
                </p>
              ) : (
                <form onSubmit={onContact} className="space-y-4">
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
                    <textarea
                      className="input min-h-28"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                    />
                  </Field>
                  <Button type="submit">Open email</Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-charcoal/8 bg-[#1C1A17] py-16 text-white">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="font-display text-2xl font-semibold">Ready when you are</h2>
            <p className="mt-2 max-w-md text-sm text-white/70">
              From your first visa document to settling in — one clear next step.
            </p>
          </div>
          <LinkButton to={ctaTo} className="bg-orange text-white hover:bg-orange-dark">
            {ctaLabel}
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
