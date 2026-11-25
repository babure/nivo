const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)(?:__Host-)?nivo_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Prefer field-level validation messages when the API returns Zod-style details. */
export function formatApiError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (Array.isArray(err.details) && err.details.length > 0) {
    const parts = err.details
      .map((d) => {
        if (!d || typeof d !== "object" || !("message" in d)) return null;
        const msg = String((d as { message: unknown }).message);
        const path = "path" in d && (d as { path?: unknown }).path ? String((d as { path: unknown }).path) : "";
        return path ? `${path}: ${msg}` : msg;
      })
      .filter((s): s is string => Boolean(s));
    if (parts.length) return parts.join(" · ");
  }
  return err.message || fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const csrf = csrfToken ?? readCsrfCookie();
  if (csrf && method !== "GET" && method !== "HEAD") {
    headers["X-CSRF-Token"] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "include", // HttpOnly session cookie (ADR-003)
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Please try again.");
  }

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  baseUrl: API_URL,
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Fetch a binary response with session cookies (for previews / downloads). */
export async function fetchAuthenticatedBlob(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "*/*" },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Please try again.");
  }
  if (!res.ok) {
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? `Download failed (${res.status})`,
    );
  }
  return res.blob();
}

/** Download an authenticated file (e.g. invoice PDF) and trigger a browser save. */
export async function downloadAuthenticated(path: string, filename: string): Promise<void> {
  const blob = await fetchAuthenticatedBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open an authenticated file inline in a new tab (View).
 * Opens the tab synchronously (user-gesture safe), then loads the blob after fetch.
 * Note: `window.open(..., "noopener")` returns null even on success — do not treat that as blocked.
 */
export async function viewAuthenticated(path: string): Promise<void> {
  const win = window.open("about:blank", "_blank");
  if (!win) {
    throw new ApiError(0, "UNKNOWN", "Pop-up blocked — allow pop-ups to view the file.");
  }
  try {
    win.document.title = "Loading…";
  } catch {
    /* cross-origin blank may block title write in some browsers */
  }
  try {
    const blob = await fetchAuthenticatedBlob(path);
    const url = URL.createObjectURL(blob);
    win.location.replace(url);
    try {
      win.opener = null;
    } catch {
      /* ignore */
    }
    // Revoke after the new tab has a chance to load the blob URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    try {
      win.close();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** Multipart upload (identity files). Does not set Content-Type so the boundary is set by fetch. */
export async function uploadFile<T = unknown>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const headers: Record<string, string> = {};
  const csrf = csrfToken ?? readCsrfCookie();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Please try again.");
  }
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }
  return data as T;
}
