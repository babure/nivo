import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TTL_MS = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev.slice(-4), { id, tone, title, description }]);
    window.setTimeout(() => dismiss(id), TTL_MS);
  }, [dismiss]);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push("success", title, description),
      error: (title, description) => push("error", title, description),
      info: (title, description) => push("info", title, description),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col items-end gap-2 sm:right-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    /* mount animation handled by CSS class */
  }, []);

  const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? CircleAlert : Info;
  const toneCls =
    item.tone === "success"
      ? "border-emerald-200 bg-white text-emerald-900"
      : item.tone === "error"
        ? "border-red-200 bg-white text-red-900"
        : "border-charcoal/10 bg-white text-charcoal";
  const hasDescription = Boolean(item.description?.trim());

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-fit max-w-full gap-2.5 rounded-xl border py-2.5 pl-3 pr-2 shadow-soft animate-rise-in ${
        hasDescription ? "items-start" : "items-center"
      } ${toneCls}`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${hasDescription ? "mt-0.5" : ""} ${
          item.tone === "success" ? "text-emerald-600" : item.tone === "error" ? "text-red-600" : "text-orange"
        }`}
        aria-hidden
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold leading-snug">{item.title}</p>
        {hasDescription ? (
          <p className="mt-0.5 text-xs leading-relaxed opacity-80">{item.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current/50 transition hover:bg-black/5 hover:text-current ${
          hasDescription ? "mt-0.5" : ""
        }`}
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
