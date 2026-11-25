import type { ReactNode } from "react";

export function Page({
  title,
  intro,
  children,
  narrow,
  actions,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
  narrow?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${narrow ? "max-w-md" : "max-w-5xl"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-charcoal sm:text-[1.75rem]">
            {title}
          </h1>
          {intro && <p className="mt-2 max-w-prose text-sm leading-relaxed text-charcoal-soft sm:text-[0.95rem]">{intro}</p>}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children && <div className="mt-6 sm:mt-8">{children}</div>}
    </div>
  );
}

export function Placeholder({ children }: { children?: ReactNode }) {
  return <div className="surface text-charcoal-soft">{children ?? "Content coming soon."}</div>;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-charcoal">{label}</span>
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
    <div className="rounded-2xl border border-orange/25 bg-white p-5 shadow-soft">
      <p className="font-display text-lg font-semibold text-charcoal">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-charcoal-soft">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}
