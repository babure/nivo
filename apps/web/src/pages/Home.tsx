import { LinkButton } from "../components/Button";

export default function Home() {
  return (
    <section
      aria-labelledby="hero-headline"
      className="relative flex flex-1 items-center overflow-hidden"
      style={{ minHeight: "min(78vh, 46rem)" }}
    >
      {/* full-bleed warm atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70rem 40rem at 80% 10%, rgb(251 119 11 / 0.22), transparent 60%), radial-gradient(60rem 36rem at 0% 100%, rgb(232 165 92 / 0.45), transparent 65%), linear-gradient(160deg, #F8F1E6 0%, #F5EFE6 45%, #F0DFC6 100%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl px-5 py-14 sm:px-6 sm:py-20">
        <p
          data-testid="brand"
          aria-label="NIVO"
          className="text-[clamp(4.5rem,22vw,11rem)] font-extrabold leading-none tracking-[0.06em] text-orange"
        >
          NIVO
        </p>
        <h1 id="hero-headline" className="mt-4 text-2xl font-semibold leading-tight text-charcoal sm:text-4xl">
          A place for new beginnings
        </h1>
        <p className="mt-4 max-w-xl text-base text-charcoal-soft sm:text-lg">
          Everything you need to arrive, settle in and start your studies abroad — in one calm, guided place.
        </p>
        <div className="mt-8">
          <LinkButton to="/register" className="w-full px-10 text-lg sm:w-auto">
            Register
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
