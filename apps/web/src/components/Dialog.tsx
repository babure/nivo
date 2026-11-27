import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider content for forms/tables */
  wide?: boolean;
};

/** Accessible modal dialog — Escape + backdrop click close. Bottom sheet on phones. */
export function Dialog({ open, title, description, onClose, children, footer, wide }: Props) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal to body so the scrim escapes the main column (z-0). The side nav is a
  // sibling at z-40 and would otherwise stay undimmed above every dialog.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-charcoal/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={`relative z-10 flex max-h-[min(92dvh,40rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-charcoal/10 bg-paper shadow-soft sm:rounded-2xl ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-charcoal/10 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-base font-semibold text-charcoal">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-xs text-charcoal-soft">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn-ghost h-9 w-9 shrink-0 rounded-xl p-0" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-charcoal/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-5 sm:pb-3 [&_.btn-primary]:w-full [&_.btn-secondary]:w-full sm:[&_.btn-primary]:w-auto sm:[&_.btn-secondary]:w-auto">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
