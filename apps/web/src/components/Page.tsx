import type { ReactNode } from "react";

export function Page({
  title,
  intro,
  children,
  narrow,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className={`mx-auto w-full px-4 py-8 sm:px-6 sm:py-12 ${narrow ? "max-w-md" : "max-w-5xl"}`}>
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {intro && <p className="mt-3 max-w-2xl text-charcoal-soft">{intro}</p>}
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}

export function Placeholder({ children }: { children?: ReactNode }) {
  return (
    <div className="surface text-charcoal-soft">
      {children ?? "Content coming soon. This is a placeholder."}
    </div>
  );
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
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
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
