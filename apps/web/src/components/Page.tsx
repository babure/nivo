import type { ReactNode } from "react";

export function Page({
  title,
  intro,
  children,
  narrow,
  wide,
  compact,
  actions,
  /** Inside WorkspaceShell — title lives in the top bar; don’t repeat the h1. */
  embedded,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
  /** Auth / single-column marketing forms */
  narrow?: boolean;
  /** Full workspace width (admin tables, dashboards) */
  wide?: boolean;
  /** Tighter padding for after-login shells */
  compact?: boolean;
  actions?: ReactNode;
  embedded?: boolean;
}) {
  // Workspace shells (admin / consultancy / student) share the same content width.
  const width = narrow ? "max-w-lg" : wide || embedded ? "max-w-6xl" : "max-w-3xl";
  const pad =
    compact || embedded
      ? "px-3 py-4 sm:px-6 sm:py-5"
      : "px-3 py-5 sm:px-6 sm:py-8";
  const showHeading = !embedded;

  return (
    <div className={`mx-auto w-full ${width} ${pad}`}>
      {(showHeading || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {showHeading ? (
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-charcoal sm:text-2xl">{title}</h1>
              {intro && (
                <p className={`max-w-prose text-sm leading-relaxed text-charcoal-soft ${compact ? "mt-1" : "mt-2"}`}>
                  {intro}
                </p>
              )}
            </div>
          ) : (
            <div className="min-w-0 md:hidden">
              <h1 className="font-display text-lg font-semibold tracking-tight text-charcoal">{title}</h1>
              {intro ? <p className="mt-0.5 text-xs text-charcoal-soft">{intro}</p> : null}
            </div>
          )}
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children && (
        <div className={showHeading || actions ? (compact ? "mt-4 sm:mt-5" : "mt-6 sm:mt-8") : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Clear visual separation between form feature groups. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-charcoal/10 bg-white p-3.5 sm:p-5">
      <header className="mb-3 border-b border-charcoal/10 pb-3">
        <h2 className="font-display text-sm font-semibold text-charcoal">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-charcoal-soft">{description}</p> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Two-column field layout on sm+ to cut scrolling. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function Placeholder({ children }: { children?: ReactNode }) {
  return <div className="surface text-charcoal-soft">{children ?? "Content coming soon."}</div>;
}

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={["block", className].filter(Boolean).join(" ")}>
      <span className="mb-1 block text-sm font-medium text-charcoal">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-charcoal-soft">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
          {error}
        </span>
      )}
    </label>
  );
}

/** Compact callout for the single next action on logged-in screens. */
export function NextStep({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-orange/25 bg-white p-4 shadow-soft sm:p-5">
      <p className="font-display text-base font-semibold text-charcoal sm:text-lg">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-charcoal-soft">{body}</p>
      <div className="mt-3 flex flex-col gap-2 [&_.btn-primary]:w-full [&_.btn-secondary]:w-full sm:[&_.btn-primary]:w-auto sm:[&_.btn-secondary]:w-auto">
        {action}
      </div>
    </div>
  );
}
