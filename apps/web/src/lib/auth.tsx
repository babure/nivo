import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Permission } from "@nivo/shared";
import { api, ApiError, setCsrfToken } from "./api";

export type SessionUser = {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string | null;
  passwordSet: boolean;
  googleLinked: boolean;
  role: "student" | "admin" | "consultancy" | null;
  permissions: Permission[];
  paymentStatus: string;
  identityComplete: boolean;
};

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  signIn: (credentials: { email: string; password: string; totp?: string }) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<SessionUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type MeResponse = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string | null;
    avatarUrl?: string | null;
    passwordSet?: boolean;
    googleLinked?: boolean;
  };
  paymentStatus: string;
  identityComplete: boolean;
  permissions: Permission[];
};

function mapMe(data: MeResponse): SessionUser {
  const role = data.user.role;
  return {
    id: data.user.id,
    email: data.user.email,
    fullName: data.user.fullName,
    avatarUrl: data.user.avatarUrl ?? null,
    passwordSet: data.user.passwordSet !== false,
    googleLinked: Boolean(data.user.googleLinked),
    // Product roles: student (null), super_admin, consultancy.
    role: role === "super_admin" ? "admin" : role === "consultancy" ? "consultancy" : "student",
    permissions: data.permissions ?? [],
    paymentStatus: data.paymentStatus,
    identityComplete: data.identityComplete,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>("/v1/auth/me");
      try {
        const csrf = await api.get<{ csrfToken: string }>("/v1/auth/csrf");
        setCsrfToken(csrf.csrfToken);
      } catch {
        /* CSRF endpoint optional during bootstrap */
      }
      const mapped = mapMe(data);
      setUser(mapped);
      return mapped;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null);
        setCsrfToken(null);
        return null;
      }
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 4000);
    void refresh().finally(() => {
      if (!cancelled) {
        window.clearTimeout(timeout);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [refresh]);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (credentials) => {
    await api.post("/v1/auth/login", {
      email: credentials.email,
      password: credentials.password,
      ...(credentials.totp ? { totp: credentials.totp } : {}),
    });
    const me = await refresh();
    if (!me) throw new ApiError(401, "UNAUTHORIZED", "Could not load your session.");
    return me;
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/v1/auth/logout");
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signOut, refresh }),
    [user, ready, signIn, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
