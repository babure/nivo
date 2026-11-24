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
import { api, ApiError } from "./api";

export type SessionUser = {
  id: string;
  email: string;
  fullName?: string;
  role: "student" | "admin" | "consultancy" | null;
  permissions: Permission[];
  paymentStatus: string;
  identityComplete: boolean;
};

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  signIn: (credentials: { email: string; password: string }) => Promise<SessionUser>;
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
    role:
      role === "super_admin" ||
      role === "operations_approver" ||
      role === "support" ||
      role === "finance" ||
      role === "content_legal_editor" ||
      role === "accommodation_agent" ||
      role === "consultancy_manager" ||
      role === "auditor"
        ? "admin"
        : role === "consultancy"
          ? "consultancy"
          : role
            ? "admin"
            : "student",
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
      const mapped = mapMe(data);
      setUser(mapped);
      return mapped;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null);
        return null;
      }
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (credentials) => {
    await api.post("/v1/auth/login", credentials);
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
