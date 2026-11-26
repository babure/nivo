import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail } from "lucide-react";
import { RouteGlobe, type GlobeTheme, type Place } from "../components/ui/route-globe";
import { Field } from "../components/Page";
import { Button, LinkButton } from "../components/Button";
import { useAuth } from "../lib/auth";
import { homePathFor } from "../lib/navigation";

const INDIA: Place = { name: "India", lon: 78.6, lat: 22 };
const TO_GERMANY: Place[] = [{ name: "Germany", lon: 10.45, lat: 51.16 }];
const GLOBE_THEME: GlobeTheme = {
  ground: "transparent",
  land: "#5E584F",
  arc: "#FB770B",
  glow: "rgb(28 26 23 / 0.1)",
  text: "#1C1A17",
  muted: "#5E584F",
};

const ARRIVE = {
  id: "arrive",
  line: "U-Bahn",
  title: "You land",
  board: "Berlin, then the list",
  src: "/landing/berlin-platform.jpg",
  alt: "A yellow U-Bahn train standing at a Berlin platform with the doors open.",
  focus: "object-[42%_38%]",
  you: "You arrive with a visa file, a place to sleep still open, and a phone that does not have a German number yet.",
  partner: "The steps sit with the people who actually do them: Expatrio for the blocked account, Fintiba for health cover, a housing contact for a room, a SIM partner for the number.",
  nivo: "NIVO is the board. €149 once, then one step at a time. We do not hold the deposit, the premium, or the rent.",
} as const;

const LINES = [
  {
    id: "blocked",
    line: "01",
    title: "Blocked account",
    board: "Deposit stays with Expatrio",
    src: "/landing/packing-suitcase.jpg",
    alt: "A person kneeling on a bed, folding clothes into an open suitcase.",
    focus: "object-[58%_center]",
    you: "Open a Sperrkonto for the living-cost funds many embassies expect. You complete Expatrio’s form and send them the deposit.",
    partner: "Expatrio holds the account, the deposit, and their own fees. NIVO only marks the step when you have started it.",
    nivo: "We link you there and keep the step on your checklist. We never receive the blocked-account money.",
  },
  {
    id: "cover",
    line: "02",
    title: "Health cover",
    board: "Premium stays with Fintiba",
    src: "/landing/apotheke.jpg",
    alt: "The Kreuzberg Apotheke sign in Berlin, with a green cross on either side of the doorway.",
    focus: "object-[center_bottom]",
    you: "When enrolment or your visa file needs student health insurance, you choose a plan and sign it yourself.",
    partner: "Fintiba is the insurer we introduce. The premium, the policy, and the claims stay between you and them.",
    nivo: "We point you to Fintiba from the checklist. We do not sell insurance and we do not take a premium.",
  },
  {
    id: "room",
    line: "03",
    title: "A room",
    board: "Rent stays with the landlord",
    src: "/landing/berlin-kitchen.jpg",
    alt: "A person cooking at the stove in a small Berlin kitchen.",
    focus: "object-[28%_center]",
    you: "Send city, monthly budget, and room type. That is the brief a housing contact can actually use.",
    partner: "A person on our side replies with student housing leads. The lease and the rent are with the landlord.",
    nivo: "We pass the brief on. We do not take a holding deposit and we are not the landlord.",
  },
  {
    id: "sim",
    line: "04",
    title: "German SIM",
    board: "Opens after the blocked account",
    src: "/landing/sim-card.jpg",
    alt: "A phone lying beside a SIM tray and a SIM card.",
    focus: "object-[center_70%]",
    you: "A German number is for after the Sperrkonto is underway, so the steps stay in an order embassies and banks recognise.",
    partner: "When the blocked-account step is complete, we link the SIM partner. You buy the plan from them.",
    nivo: "Until then the card shows locked. We do not sell airtime.",
  },
] as const;

type LineId = (typeof ARRIVE)["id"] | (typeof LINES)[number]["id"];

const STEPS = [
  {
    title: "Create the account",
    body: "Name, email, and a password. Confirm the email before the checklist will open.",
    detail:
      "You also accept the current terms. If we publish a new version later, we ask you to accept that one before you continue. We do not fail the payment on a stale copy.",
  },
  {
    title: "Pay €149 once",
    body: "That is the NIVO fee. It unlocks the checklist. It is not the blocked-account deposit.",
    detail:
      "Checkout shows the published terms and the withdrawal note for this version. Expatrio, Fintiba, a landlord, and a SIM partner invoice you separately, on their own sites.",
  },
  {
    title: "Add the details partners need",
    body: "Identity fields are encrypted. They exist so a partner card can unlock, not so a form can sit in someone’s inbox.",
    detail:
      "You can see what you stored. A consultancy only sees contact details if you turn sharing on for the organisation that invited you.",
  },
  {
    title: "Work the next line",
    body: "Blocked account, health cover, a housing brief, then the SIM. One open step, not a wall of tasks.",
    detail:
      "The SIM card stays locked until the blocked-account step is done. Housing is a brief you send — city, budget, room type — and a person writes back with leads.",
  },
] as const;

const INCLUDED = [
  "The checklist, with one next step instead of a pile of tabs",
  "Encrypted identity fields so partner cards can unlock",
  "Links to Expatrio, Fintiba, a housing follow-up, and the SIM partner",
  "A person you can email when a document or a link gets stuck",
] as const;

const ELSEWHERE = [
  "The Sperrkonto deposit, and Expatrio’s own fees",
  "The Fintiba health-insurance premium",
  "Rent, and any deposit the landlord asks for",
  "The SIM plan itself, after that step unlocks",
] as const;

const TOPICS = [
  {
    id: "general",
    label: "General",
    prompt:
      "No account needed. Ask about the €149 fee, the order of the lines, or whether to start before you register.",
  },
  {
    id: "blocked",
    label: "Blocked account",
    prompt: "Say where you are with Expatrio, and quote what the screen or their email said.",
  },
  {
    id: "cover",
    label: "Health cover",
    prompt: "Say whether you still need the Fintiba link, or the policy is signed and something after that is stuck.",
  },
  {
    id: "room",
    label: "A room",
    prompt: "City, monthly budget, and room type are enough to start. Add anything you already tried.",
  },
  {
    id: "sim",
    label: "German SIM",
    prompt: "Say whether the blocked-account step is done. If the card is still locked, that is why.",
  },
  {
    id: "account",
    label: "The account",
    prompt: "Use the email on the account, and say whether this is payment, login, or a document.",
  },
] as const;

const FAQ = [
  [
    "What is a blocked account?",
    "A Sperrkonto holds the living-cost funds many embassies expect in a student visa file. NIVO routes you to Expatrio to open it. Their deposit and fees are separate from the €149 NIVO fee, and the money never sits in a NIVO account.",
  ],
  [
    "Do you sell health insurance?",
    "No. When you need student cover, the checklist introduces Fintiba. You sign the policy there and pay them the premium. NIVO does not underwrite anything and does not take that payment.",
  ],
  [
    "How does housing work?",
    "You send a city, a monthly budget, and a room type. A person follows up with student housing leads. We are not a listing site, and we do not hold rent.",
  ],
  [
    "Why is the SIM locked?",
    "A German number unlocks after the blocked-account step is marked done, so the order of the file stays intact. Until then the card is visible and locked. The plan is billed by the SIM partner, not by NIVO.",
  ],
  [
    "What does €149 pay for?",
    "The platform and the support around it: the checklist, encrypted details, partner introductions, and someone to email. It is once. It is not a subscription, and it does not include the deposit, the premium, the rent, or airtime.",
  ],
  [
    "How long does this take?",
    "The account, the email confirmation, and the €149 payment are minutes. Expatrio, Fintiba, and a room follow your documents and their own queues. NIVO does not invent a timer for those.",
  ],
  [
    "Can a consultancy see my progress?",
    "Only if you were invited with a referral and you choose to share contact details with that organisation. You can leave sharing off. Staff accounts are separate from your student checklist.",
  ],
] as const;

function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function frameFor(id: LineId) {
  if (id === ARRIVE.id) return ARRIVE;
  return LINES.find((line) => line.id === id) ?? ARRIVE;
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

  const [lineId, setLineId] = useState<LineId>(ARRIVE.id);
  const [bill, setBill] = useState<"included" | "elsewhere">("included");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [topicId, setTopicId] = useState<(typeof TOPICS)[number]["id"]>("general");
  const [sent, setSent] = useState(false);
  const topic = TOPICS.find((item) => item.id === topicId) ?? TOPICS[0];

  const frame = frameFor(lineId);

  useEffect(() => {
    if (location.hash) requestAnimationFrame(() => scrollToHash(location.hash));
  }, [location.hash]);

  function onContact(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(
      topic ? `NIVO — ${topic.label} — from ${name || "website"}` : `NIVO contact from ${name || "website"}`,
    );
    const body = encodeURIComponent(`${message}\n\n— ${name}\n${email}`);
    window.location.href = `mailto:hello@nivo.demo?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <div>
      <section aria-labelledby="hero-headline" className="hero-flight relative isolate min-h-[calc(100svh-4.25rem)] overflow-hidden border-b border-charcoal/8">
        <div className="hero-globe">
          <RouteGlobe hub={INDIA} places={TO_GERMANY} theme={GLOBE_THEME} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-paper from-[6%] via-paper/85 via-[22%] to-transparent to-[42%]" aria-hidden />
        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[calc(100svh-4.25rem)] max-w-5xl items-center px-4 py-12 sm:px-6">
          <div className="pointer-events-auto max-w-xl">
            <p
              data-testid="brand"
              className="font-display text-4xl font-extrabold leading-none tracking-[0.14em] text-orange sm:text-5xl"
            >
              NIVO
            </p>
            <h1
              id="hero-headline"
              className="font-display mt-4 max-w-md text-[1.85rem] font-semibold leading-tight text-charcoal sm:text-4xl"
            >
              A place for new beginnings
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-charcoal-soft">
              One checklist for the move from India to Germany: a blocked account for the visa file, student health
              cover, a housing lead, and a German SIM. You pay NIVO €149 once. Expatrio, Fintiba, and your landlord
              bill you themselves.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link to={ctaTo} className="btn-primary px-8">
                {ctaLabel}
              </Link>
              <a
                href="#path"
                className="btn-secondary"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToHash("#path");
                  history.replaceState(null, "", "#path");
                }}
              >
                See the four lines
              </a>
            </div>
          </div>
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
              Four lines, in the order you will meet them
            </h2>
            <p className="mt-3 text-charcoal-soft">
              Pick a line. The photograph and the small print change with it, so you can see who does the work and who
              keeps the money.
            </p>
          </div>

          <div className="mt-8 grid items-stretch gap-6 sm:mt-10 lg:grid-cols-[minmax(16rem,0.82fr)_minmax(0,1.18fr)] lg:gap-8">
            <div role="tablist" aria-label="Checklist lines" className="grid content-start gap-2">
              {LINES.map((item) => {
                const selected = lineId === item.id;
                return (
                  <button
                    key={item.id}
                    id={`line-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="path-detail"
                    className={`min-h-tap rounded-xl border px-4 py-3 text-left transition-colors duration-200 ease-out ${
                      selected
                        ? "border-orange bg-orange/10"
                        : "border-charcoal/10 bg-paper hover:border-charcoal/20"
                    }`}
                    onClick={() => setLineId(item.id)}
                  >
                    <span className="font-display text-sm font-semibold tabular-nums text-orange-dark">{item.line}</span>
                    <span className="mt-1 block font-display text-base font-semibold text-charcoal">{item.title}</span>
                    <span className="mt-1 block text-sm leading-snug text-charcoal-soft">{item.board}</span>
                  </button>
                );
              })}
            </div>

            <figure className="relative overflow-hidden max-lg:aspect-video lg:h-full">
              <img
                src={frame.src}
                alt={frame.alt}
                className={`absolute inset-0 h-full w-full object-cover ${frame.focus}`}
                width={1600}
                height={900}
                decoding="async"
              />
            </figure>
          </div>

          <div
            id="path-detail"
            role="tabpanel"
            aria-live="polite"
            aria-labelledby={lineId === ARRIVE.id ? undefined : `line-${lineId}`}
            className="mt-6 grid gap-4 border-t border-charcoal/10 pt-6 sm:grid-cols-3"
          >
            <Detail label="What you do" body={frame.you} />
            <Detail label="Who you deal with" body={frame.partner} />
            <Detail label="What NIVO does not touch" body={frame.nivo} />
          </div>

          {lineId !== ARRIVE.id && (
            <button
              type="button"
              className="mt-4 text-sm font-semibold text-orange-dark underline-offset-4 hover:underline"
              onClick={() => setLineId(ARRIVE.id)}
            >
              Back to the platform
            </button>
          )}

          <p className="mt-8 text-sm text-charcoal-soft">Photographs via Pexels.</p>
          <p className="mt-3 text-sm text-charcoal-soft">
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
            How a student actually moves through it
          </h2>
          <p className="mt-2 max-w-prose text-charcoal-soft">
            Open a step if you want the part that usually surprises people. Signup is short. The partners are not.
          </p>
          <ol className="relative mt-10 space-y-0 border-l border-charcoal/15 pl-0 sm:mt-12">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative pb-2 pl-8">
                <span className="absolute -left-3 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-orange font-display text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <details className="group border-b border-charcoal/10 py-3">
                  <summary className="flex min-h-tap cursor-pointer list-none items-start justify-between gap-4">
                    <span>
                      <span className="block font-display text-base font-semibold text-charcoal sm:text-lg">
                        {step.title}
                      </span>
                      <span className="mt-1 block max-w-prose text-sm leading-relaxed text-charcoal-soft">
                        {step.body}
                      </span>
                    </span>
                    <span className="mt-1 shrink-0 text-orange transition-transform duration-200 ease-out group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-prose pb-2 text-sm leading-relaxed text-charcoal">{step.detail}</p>
                </details>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="fee"
        className="scroll-mt-20 border-y border-charcoal/8 bg-white py-14 sm:scroll-mt-24 sm:py-20"
        aria-labelledby="fee-title"
      >
        <div className="mx-auto grid max-w-5xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-14">
          <div>
            <h2 id="fee-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              €149, and a clear edge around it
            </h2>
            <p className="mt-3 max-w-prose text-charcoal-soft">
              The number on the NIVO invoice is the platform. Switch the card to see what never appears on it.
            </p>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-charcoal">
              <li>One payment. After it clears, the checklist opens and stays open.</li>
              <li>Partner links leave NIVO. Their checkout is theirs.</li>
              <li>
                Terms are the version published today. If that version changes, we ask you to accept the new one
                instead of failing the payment.
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-charcoal/15 bg-paper p-5 sm:p-6">
            <p className="font-display text-sm font-semibold text-charcoal-soft">NIVO fee</p>
            <p className="font-display mt-1 text-4xl font-semibold tracking-tight text-charcoal">€149</p>
            <p className="mt-1 text-sm text-charcoal-soft">Once. Not a subscription.</p>
            <div className="mt-5 grid grid-cols-2 gap-2" role="tablist" aria-label="What the fee covers">
              <button
                type="button"
                role="tab"
                aria-selected={bill === "included"}
                className={`min-h-tap rounded-xl px-3 text-sm font-semibold transition-colors duration-200 ease-out ${
                  bill === "included" ? "bg-charcoal text-white" : "bg-white text-charcoal"
                }`}
                onClick={() => setBill("included")}
              >
                Included
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bill === "elsewhere"}
                className={`min-h-tap rounded-xl px-3 text-sm font-semibold transition-colors duration-200 ease-out ${
                  bill === "elsewhere" ? "bg-charcoal text-white" : "bg-white text-charcoal"
                }`}
                onClick={() => setBill("elsewhere")}
              >
                Billed elsewhere
              </button>
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-charcoal" aria-live="polite">
              {(bill === "included" ? INCLUDED : ELSEWHERE).map((item) => (
                <li key={item} className="border-t border-charcoal/10 pt-2">
                  {item}
                </li>
              ))}
            </ul>
            <Link to={ctaTo} className="btn-primary mt-6 w-full">
              {ctaLabel}
            </Link>
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="scroll-mt-20 py-14 sm:scroll-mt-24 sm:py-20"
        aria-labelledby="faq-title"
      >
        <div className="mx-auto grid max-w-5xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
          <div>
            <h2 id="faq-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Straight answers
            </h2>
            <p className="mt-3 text-charcoal-soft">
              The short version of what students ask before they pay, and what we refuse to blur.
            </p>
            <figure className="mt-6 hidden overflow-hidden bg-mist lg:block">
              <img
                src="/landing/apotheke.jpg"
                alt="Kreuzberg Apotheke, the green crosses marking a Berlin pharmacy."
                className="aspect-[4/5] w-full object-cover object-bottom"
                width={1200}
                height={1500}
                loading="lazy"
                decoding="async"
              />
            </figure>
          </div>
          <div className="divide-y divide-charcoal/10 border-y border-charcoal/10">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-4 font-medium text-charcoal">
                  {q}
                  <span
                    className="text-orange transition-transform duration-200 ease-out group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-prose text-sm leading-relaxed text-charcoal-soft">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        id="about"
        className="scroll-mt-20 border-t border-charcoal/8 bg-paper py-14 sm:scroll-mt-24 sm:py-20"
        aria-labelledby="about-title"
      >
        <div className="mx-auto grid max-w-5xl items-start gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div>
            <h2 id="about-title" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Talk to a person
            </h2>
            <p className="mt-3 max-w-prose text-charcoal-soft">
              Write before you register, or after, when a document, a partner link, or the account itself is stuck.
              General is for a normal question. The other lines are for something already in progress.
            </p>
            <figure className="mt-6 overflow-hidden">
              <img
                src="/landing/berlin-street.jpg"
                alt="A Berlin pavement café behind a pole of German street signs, with a bicycle locked in front."
                className="aspect-[5/4] w-full object-cover object-[72%_32%]"
                width={1600}
                height={1280}
                loading="lazy"
                decoding="async"
              />
            </figure>
            <ul className="mt-4 max-w-prose space-y-2 text-sm leading-relaxed text-charcoal-soft">
              <li>A person reads hello@nivo.demo. There is no phone queue.</li>
              <li>
                Deposit, premium, and rent are not ours to move. If you already wrote to Expatrio, Fintiba, or a
                landlord, say so — we will not send you back to the same form.
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-charcoal/10 bg-white p-5 sm:p-6">
            {sent ? (
              <div role="status">
                <h3 className="font-display text-xl font-semibold text-charcoal">Your email app should open</h3>
                <p className="mt-3 text-sm leading-relaxed text-charcoal-soft">
                  {topic
                    ? `The subject names ${topic.label}. `
                    : "Add the line in the subject if you did not pick one. "}
                  If nothing opened, write to{" "}
                  <a className="font-medium text-orange-dark underline" href="mailto:hello@nivo.demo">
                    hello@nivo.demo
                  </a>{" "}
                  and include the partner page and what the screen said.
                </p>
                <button
                  type="button"
                  className="mt-5 text-sm font-medium text-orange-dark underline underline-offset-4"
                  onClick={() => setSent(false)}
                >
                  Write another note
                </button>
              </div>
            ) : (
              <form onSubmit={onContact} className="space-y-4">
                <fieldset>
                  <legend className="text-sm font-medium text-charcoal">What is this about?</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TOPICS.map((item) => {
                      const selected = topicId === item.id;
                      return (
                        <label
                          key={item.id}
                          className={`inline-flex min-h-tap cursor-pointer items-center rounded-xl border px-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange ${
                            selected
                              ? "border-orange bg-orange/10 text-charcoal"
                              : "border-charcoal/12 bg-paper text-charcoal-soft hover:border-charcoal/30 hover:text-charcoal"
                          }`}
                          style={{
                            transitionProperty: "color, background-color, border-color",
                            transitionDuration: "140ms",
                            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                        >
                          <input
                            type="radio"
                            name="contact-line"
                            value={item.id}
                            checked={selected}
                            onChange={() => setTopicId(item.id)}
                            className="sr-only"
                          />
                          {item.label}
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-charcoal-soft" aria-live="polite">
                    {topic.prompt}
                  </p>
                </fieldset>
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
                    autoComplete="email"
                  />
                </Field>
                <Field label="Message">
                  <textarea
                    className="input min-h-32"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    placeholder={topic.prompt}
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
      </section>

      <section className="bg-charcoal text-white" aria-labelledby="ready-title">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,42%)]">
          <div className="px-4 py-12 sm:px-6 sm:py-16 lg:py-16 lg:pl-[max(1.5rem,calc((100vw-64rem)/2+1.5rem))] lg:pr-12">
            <h2 id="ready-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              When you are ready
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-white/80">
              The order does not change, and the NIVO invoice does not grow past €149.
            </p>
            <ol className="mt-8 border-y border-white/15">
              {LINES.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-col gap-0.5 border-b border-white/10 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="font-medium">
                    <span className="mr-2 text-orange">{line.line}</span>
                    {line.title}
                  </span>
                  <span className="text-sm text-white/70 sm:text-right">{line.board}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <LinkButton to={ctaTo} className="w-full justify-center sm:w-auto">
                {ctaLabel}
              </LinkButton>
              <p className="text-sm text-white/75">Partner bills stay on their own invoices.</p>
            </div>
          </div>
          <figure className="relative lg:min-h-full">
            <img
              src="/landing/packing-suitcase.jpg"
              alt="A person kneeling on a bed, folding clothes into an open suitcase."
              className="h-64 w-full object-cover object-[72%_68%] sm:h-72 lg:absolute lg:inset-0 lg:h-full"
              width={1600}
              height={1067}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-charcoal">{label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{body}</p>
    </div>
  );
}
