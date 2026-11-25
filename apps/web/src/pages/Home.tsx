import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  Building2,
  CreditCard,
  FileKey2,
  Mail,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Field } from "../components/Page";
import { Button, LinkButton } from "../components/Button";
import { useAuth } from "../lib/auth";
import { homePathFor } from "../lib/navigation";

const PATH_ITEMS = [
  {
    title: "Blocked account",
    body: "Open a Sperrkonto with Expatrio for your visa file. The deposit and their fees stay with Expatrio — NIVO only tracks the step.",
    icon: CreditCard,
  },
  {
    title: "Health insurance",
    body: "When you need student cover, we point you to Fintiba. You sign and pay there; we do not sell insurance.",
    icon: ShieldCheck,
  },
  {
    title: "Housing",
    body: "Tell us city, budget, and room type. A person on our side follows up with student housing leads — not a faceless form dump.",
    icon: Building2,
  },
  {
    title: "German SIM",
    body: "Shows as locked until the blocked-account step is done, then you can activate with the partner we link.",
    icon: Smartphone,
  },
] as const;

const JOURNEY = [
  {
    title: "Create your account",
    body: "Email, verify, then the one-time €149 NIVO fee.",
  },
  {
    title: "Add your details",
    body: "Encrypted identity fields so partner cards can unlock.",
  },
  {
    title: "Work the checklist",
    body: "Blocked account, SIM, housing — one next step, not a wall of tasks.",
  },
  {
    title: "Fly with momentum",
    body: "Land knowing the paperwork trail is already moving.",
  },
] as const;

const FAQ = [
  [
    "What is a blocked account?",
    "A Sperrkonto holds living-cost funds many embassies expect for a student visa. NIVO routes you to Expatrio to open it. Their deposit and fees are separate from the €149 NIVO fee.",
  ],
  [
    "What about health insurance?",
    "NIVO introduces Fintiba for student health insurance. Contracts and premiums are between you and Fintiba.",
  ],
  [
    "How long does setup take?",
    "Signup and verification are minutes. Paying €149 unlocks the checklist. Expatrio, Fintiba, and housing follow your documents — not a fixed NIVO timer.",
  ],
  [
    "How much does NIVO cost?",
    "€149 once for the NIVO platform and support. Blocked-account, insurance, SIM, and rent are billed by those providers.",
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
    : "Create account";

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
      <section
        aria-labelledby="hero-headline"
        className="relative overflow-hidden"
        style={{ minHeight: "min(88dvh, 56rem)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-horizon-shift"
          style={{
            backgroundImage:
              "linear-gradient(118deg, #1C1A17 0%, #2A241C 36%, #6B3E12 66%, #FB770B 100%)",
            backgroundSize: "140% 140%",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 45% at 75% 100%, rgb(232 165 92 / 0.5), transparent 55%), linear-gradient(180deg, transparent 50%, rgb(28 26 23 / 0.65) 100%)",
          }}
        />
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-36 w-full text-black/30 sm:h-48"
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            d="M0 200V120h40v-40h20v40h30V80h25v40h50V60h40v60h35V90h20v50h60V40h45v80h55V70h30v70h80V50h50v90h70V30h60v110h90V80h40v60h100V100h35v40h120V90h50v50h120v60H0z"
          />
        </svg>

        {/* One load choreography — not staggered fade-ups on every line */}
        <div className="relative mx-auto flex max-w-3xl animate-rise-in flex-col items-center px-4 pb-16 pt-28 text-center sm:px-6 sm:pb-24 sm:pt-36">
          <p
            data-testid="brand"
            className="font-display text-[clamp(3.25rem,14vw,7.5rem)] font-extrabold leading-[0.86] tracking-[0.08em] text-white"
          >
            NIVO
          </p>
          <h1
            id="hero-headline"
            className="font-display mt-6 max-w-xl text-2xl font-semibold leading-snug text-white sm:text-[2.35rem] sm:leading-tight"
          >
            Arrive in Germany with the boring parts already moving
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/80 sm:text-lg">
            Blocked account, housing leads, SIM unlock, and a checklist that only shows the next useful step.
          </p>
          <div className="mt-9 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <Link
              to={ctaTo}
              className="btn inline-flex min-h-tap items-center justify-center rounded-xl bg-white px-8 text-[0.95rem] font-semibold text-charcoal no-underline hover:bg-paper"
            >
              {ctaLabel}
            </Link>
            <a
              href="#how-it-works"
              className="btn inline-flex min-h-tap items-center justify-center rounded-xl border border-white/40 bg-transparent px-6 text-[0.95rem] font-semibold text-white no-underline hover:bg-white/10"
              onClick={(e) => {
                e.preventDefault();
                scrollToHash("#how-it-works");
                history.replaceState(null, "", "#how-it-works");
              }}
            >
              How it works
            </a>
          </div>
          <p className="mt-5 text-sm text-white/65">€149 once for NIVO · Expatrio, Fintiba, rent billed by them</p>

          <p className="mt-12 max-w-xl text-sm leading-relaxed text-white/55">
            Built with Expatrio for Sperrkonto and Fintiba for insurance — your contracts stay with them; we keep the path
            readable.
          </p>
        </div>
      </section>

      <section
        id="path"
        className="scroll-mt-20 border-b border-charcoal/8 bg-white py-14 sm:scroll-mt-24 sm:py-20"
        aria-labelledby="path-title"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="max-w-xl">
            <h2
              id="path-title"
              className="font-display text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl"
            >
              What sits on your checklist
            </h2>
            <p className="mt-3 text-charcoal-soft">
              Not a marketplace. A short list of the steps most students actually need before and after landing.
            </p>
          </div>

          <ul className="mt-10 grid gap-0 border-t border-charcoal/10 sm:mt-12 sm:grid-cols-2 sm:border-l">
            {PATH_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="border-b border-charcoal/10 p-5 sm:border-r sm:p-7">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-mist text-orange-dark">
                    <Icon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
                  </span>
                  <h3 className="font-display mt-4 text-lg font-semibold text-charcoal">{item.title}</h3>
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-charcoal-soft sm:text-[0.95rem]">
                    {item.body}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-8 text-sm text-charcoal-soft">
            Curious how referrals work?{" "}
            <Link to="/our-role" className="font-semibold text-orange-dark no-underline hover:underline">
              Read our role
            </Link>
            .
          </p>
        </div>
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-20 py-14 sm:scroll-mt-24 sm:py-20"
        aria-labelledby="journey-title"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 id="journey-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <p className="mt-2 max-w-prose text-charcoal-soft">Four beats — signup to landing with momentum.</p>
          <ol className="mt-10 space-y-0 border-t border-charcoal/10 sm:mt-12">
            {JOURNEY.map((s, i) => (
              <li
                key={s.title}
                className="grid gap-2 border-b border-charcoal/10 py-5 sm:grid-cols-[3.5rem_11rem_1fr] sm:items-baseline sm:gap-6 sm:py-6"
              >
                <span className="font-display text-sm font-semibold tabular-nums text-orange-dark">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-base font-semibold text-charcoal sm:text-lg">{s.title}</h3>
                <p className="text-sm leading-relaxed text-charcoal-soft sm:text-[0.95rem]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="faq"
        className="scroll-mt-20 border-y border-charcoal/8 bg-white py-14 sm:scroll-mt-24 sm:py-20"
        aria-labelledby="faq-title"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 id="faq-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Straight answers
          </h2>
          <div className="mt-8 max-w-3xl divide-y divide-charcoal/10 border-y border-charcoal/10 sm:mt-10">
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

      <section id="about" className="scroll-mt-20 py-14 sm:scroll-mt-24 sm:py-20" aria-labelledby="about-title">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
            <div>
              <h2 id="about-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Talk to a person
              </h2>
              <p className="mt-3 max-w-prose text-charcoal-soft">
                Stuck on a document, a partner link, or your account? Email us. We introduce partners; we do not hold
                your blocked-account deposit or insurance premiums.
              </p>
              <p className="mt-6">
                <a
                  className="inline-flex items-center gap-2 font-medium text-orange-dark no-underline hover:underline"
                  href="mailto:hello@nivo.demo"
                >
                  <FileKey2 className="h-4 w-4 shrink-0" aria-hidden />
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
                  <Button type="submit" className="w-full sm:w-auto">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden />
                    Open email
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-charcoal/8 bg-[#1C1A17] py-14 text-white sm:py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-stretch justify-between gap-8 px-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="font-display text-sm font-bold tracking-[0.18em] text-orange">NIVO</p>
            <h2 className="font-display mt-2 text-xl font-semibold sm:text-2xl">When you are ready</h2>
            <p className="mt-2 max-w-md text-sm text-white/70">
              One fee, one checklist, partner steps that stay where they belong.
            </p>
          </div>
          <LinkButton to={ctaTo} className="w-full justify-center bg-orange text-white hover:bg-orange-dark sm:w-auto">
            {ctaLabel}
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
