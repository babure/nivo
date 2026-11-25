import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { emailSchema } from "@nivo/shared";
import { Field, Page } from "../components/Page";
import { Button } from "../components/Button";
import { GoogleSignInButton } from "../components/GoogleSignIn";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Login({ kind = "student" }: { kind?: "student" | "admin" }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get("oauth") === "error") {
      setError("Google sign-in failed. Try again or use email and password.");
    }
  }, [params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!emailSchema.safeParse(email).success || !password) {
      setError("Enter a valid email and password.");
      return;
    }
    if (needsTotp && !/^\d{6}$/.test(totp)) {
      setError("Enter your 6-digit authenticator code.");
      return;
    }
    setBusy(true);
    try {
      const user = await signIn({
        email,
        password,
        ...(needsTotp || totp ? { totp } : {}),
      });
      const from = (location.state as { from?: string } | null)?.from;
      const isAdmin = user.role === "admin";
      if (kind === "admin" && !isAdmin) {
        setError("This account is not an admin account.");
        return;
      }
      const dest =
        from ??
        (isAdmin || kind === "admin"
          ? "/admin/students"
          : user.role === "consultancy"
            ? "/consultancy/dashboard"
            : nextStudentPath(user));
      navigate(dest, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH_2FA_REQUIRED") {
        setNeedsTotp(true);
        setError("Enter your two-factor authentication code.");
      } else {
        setError(err instanceof ApiError ? err.message : "Could not sign in.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title={kind === "admin" ? "Admin sign in" : "Welcome back"}
      intro={kind === "admin" ? "Staff access to the NIVO workspace." : "Continue your arrival path."}
      narrow
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {kind === "student" && (
          <GoogleSignInButton next={(location.state as { from?: string } | null)?.from} />
        )}
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {(needsTotp || kind === "admin") && (
          <Field label="Authenticator code">
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </Field>
        )}
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Log in"}
        </Button>
        {kind === "student" && (
          <div className="flex flex-col items-center gap-1 text-sm">
            <Link to="/forgot-password" className="inline-flex min-h-tap items-center text-orange-dark underline">
              Forgot password?
            </Link>
            <Link to="/register" className="inline-flex min-h-tap items-center text-orange-dark underline">
              Create an account
            </Link>
          </div>
        )}
      </form>
    </Page>
  );
}

function nextStudentPath(user: { paymentStatus: string; identityComplete: boolean }) {
  if (user.paymentStatus !== "paid") return "/pay";
  if (!user.identityComplete) return "/onboarding/identity";
  return "/dashboard";
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!emailSchema.safeParse(email).success) {
      setError("Enter a valid email address.");
      return;
    }
    try {
      await api.post("/v1/auth/forgot-password", { email });
    } catch {
      /* do not reveal whether the account exists */
    }
    setSent(true);
  }

  return (
    <Page title="Reset your password" narrow>
      {sent ? (
        <div className="space-y-3 text-sm text-charcoal-soft">
          <p>If an account exists for that email, we sent a reset link. Check your inbox and follow the link.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Email">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </Page>
  );
}

export function ResetPassword() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await api.post("/v1/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Choose a new password" narrow>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-charcoal-soft">Your password was updated. Sign in with the new password.</p>
          <Link to="/login" className="btn-primary inline-flex w-full justify-center">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {!params.get("token") && (
            <Field label="Reset token" hint="From the reset email link.">
              <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
            </Field>
          )}
          <Field label="New password" hint="At least 12 characters with upper, lower and a number.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
            />
          </Field>
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || token.length < 20}>
            {busy ? "Saving…" : "Update password"}
          </Button>
        </form>
      )}
    </Page>
  );
}

export function VerifyEmail() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;
  const linkToken = new URLSearchParams(location.search).get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(Boolean(linkToken));

  useEffect(() => {
    if (!linkToken || linkToken.length < 20) return;
    let cancelled = false;
    setBusy(true);
    setError(undefined);
    void api
      .post("/v1/auth/verify-email", { token: linkToken })
      .then(() => {
        if (!cancelled) setDone(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not verify.");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken]);

  return (
    <Page
      title={busy ? "Verifying your email" : done ? "Email verified" : "Check your inbox"}
      intro={
        busy
          ? "One moment…"
          : done
            ? "You can sign in and continue."
            : email
              ? `We sent a verification link to ${email}. Open it to continue.`
              : "Open the verification link from your email to continue."
      }
      narrow
    >
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-charcoal-soft">Email verified. Sign in to continue to payment.</p>
          <Link to="/login" className="btn-primary inline-flex w-full justify-center">
            Sign in
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          {!busy && !linkToken && (
            <p className="text-sm text-charcoal-soft">
              Didn’t get it? Check spam, or try registering again after a minute.
            </p>
          )}
          {busy && <p className="text-sm text-charcoal-soft">Confirming your email…</p>}
          {error && (
            <Link to="/login" className="btn-secondary inline-flex w-full justify-center">
              Back to sign in
            </Link>
          )}
        </div>
      )}
    </Page>
  );
}
