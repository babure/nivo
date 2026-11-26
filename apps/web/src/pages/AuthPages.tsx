import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { emailSchema, PASSWORD_REQUIREMENTS, passwordSchema } from "@nivo/shared";
import { Field, Page } from "../components/Page";
import { KeyRound, LogIn, Mail } from "lucide-react";
import { Button } from "../components/Button";
import { GoogleSignInButton } from "../components/GoogleSignIn";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { resolvePostLoginPath } from "../lib/navigation";
import { useToast } from "../lib/toast";

export function Login({ kind = "student" }: { kind?: "student" | "admin" }) {
  const { signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const fromPath = (location.state as { from?: string } | null)?.from ?? "";
  const consultancyIntent = kind === "student" && fromPath.startsWith("/consultancy");

  useEffect(() => {
    if (params.get("oauth") === "error") {
      toast.error("Google sign-in failed", "Try again or use email and password.");
    }
  }, [params, toast]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success || !password) {
      toast.error("Enter a valid email and password");
      return;
    }
    setBusy(true);
    try {
      const user = await signIn({ email, password });
      const from = (location.state as { from?: string } | null)?.from;
      if (kind === "admin" && user.role !== "admin") {
        await signOut();
        toast.error("This account is not an admin account");
        return;
      }
      if (kind === "student" && user.role === "admin") {
        navigate("/admin/students", { replace: true });
        return;
      }
      if (kind === "student" && user.role === "consultancy") {
        navigate("/consultancy/dashboard", { replace: true });
        return;
      }
      navigate(resolvePostLoginPath(user, from), { replace: true });
    } catch (err) {
      toast.error("Could not sign in", formatApiError(err, "Check your email and password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title={kind === "admin" ? "Admin sign in" : consultancyIntent ? "Consultancy sign in" : "Welcome back"}
      intro={
        kind === "admin"
          ? "Staff access to the NIVO workspace."
          : consultancyIntent
            ? "Sign in with the manager email your admin created for your organisation."
            : "Continue your arrival path."
      }
      narrow
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {kind === "student" && !consultancyIntent && (
          <GoogleSignInButton next={(location.state as { from?: string } | null)?.from} />
        )}
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          <LogIn className="h-4 w-4 shrink-0" aria-hidden />
          {busy ? "Signing in…" : "Log in"}
        </Button>
        {kind === "student" && (
          <div className="flex flex-col items-center gap-1 text-sm">
            <Link to="/forgot-password" className="inline-flex min-h-tap items-center text-orange-dark underline">
              Forgot password?
            </Link>
            {!consultancyIntent && (
              <Link to="/register" className="inline-flex min-h-tap items-center text-orange-dark underline">
                Create an account
              </Link>
            )}
            {consultancyIntent && (
              <p className="text-center text-xs text-charcoal-soft">
                Need access? Ask a NIVO admin to invite you under Partners — you&apos;ll get an email to set your password.
              </p>
            )}
          </div>
        )}
      </form>
    </Page>
  );
}

export function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success) {
      toast.error("Enter a valid email address");
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
          <Button type="submit" className="w-full">
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            Send reset link
          </Button>
        </form>
      )}
    </Page>
  );
}

export function ResetPassword() {
  const location = useLocation();
  const toast = useToast();
  const params = new URLSearchParams(location.search);
  const isInvite = params.get("invite") === "consultancy";
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (token.trim().length < 20) {
      toast.error(
        isInvite
          ? "Open the full invite link from your email"
          : "Paste the full reset link or token from your email",
      );
      return;
    }
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error("Check the form", parsed.error.issues[0]?.message ?? PASSWORD_REQUIREMENTS);
      return;
    }
    setBusy(true);
    try {
      await api.post("/v1/auth/reset-password", { token: token.trim(), password: parsed.data });
      setDone(true);
      toast.success(isInvite ? "You're in — password set" : "Password updated");
    } catch (err) {
      toast.error(
        isInvite ? "Could not complete invite" : "Could not reset password",
        formatApiError(err, "Request a new link if this one expired."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title={isInvite ? "Join your consultancy" : "Choose a new password"}
      intro={
        isInvite
          ? "Set a password to activate your consultancy portal login."
          : undefined
      }
      narrow
    >
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-charcoal-soft">
            {isInvite
              ? "Your account is ready. Sign in to open the consultancy portal."
              : "Your password was updated. Sign in with the new password."}
          </p>
          <Link to="/login" className="btn-primary inline-flex w-full justify-center">
            <LogIn className="h-4 w-4 shrink-0" aria-hidden />
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {!params.get("token") && (
            <Field label={isInvite ? "Invite token" : "Reset token"} hint="From the email link.">
              <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
            </Field>
          )}
          <Field label={isInvite ? "Choose a password" : "New password"} hint={PASSWORD_REQUIREMENTS}>
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
          <Button type="submit" className="w-full" disabled={busy || token.length < 20}>
            <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
            {busy ? "Saving…" : isInvite ? "Set password and join" : "Update password"}
          </Button>
        </form>
      )}
    </Page>
  );
}

export function VerifyEmail() {
  const location = useLocation();
  const toast = useToast();
  const email = (location.state as { email?: string } | null)?.email;
  const linkToken = new URLSearchParams(location.search).get("token") ?? "";
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(Boolean(linkToken));

  useEffect(() => {
    if (!linkToken || linkToken.length < 20) return;
    let cancelled = false;
    setBusy(true);
    setFailed(false);
    void api
      .post("/v1/auth/verify-email", { token: linkToken })
      .then(() => {
        if (!cancelled) {
          setDone(true);
          toast.success("Email verified");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFailed(true);
          toast.error(
            "Could not verify",
            formatApiError(err, "Request a new link if this one expired."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, toast]);

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
            <LogIn className="h-4 w-4 shrink-0" aria-hidden />
            Sign in
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {!busy && !linkToken && (
            <p className="text-sm text-charcoal-soft">
              Didn’t get it? Check spam, or try registering again after a minute.
            </p>
          )}
          {busy && <p className="text-sm text-charcoal-soft">Confirming your email…</p>}
          {failed && (
            <Link to="/login" className="btn-secondary inline-flex w-full justify-center">
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              Back to sign in
            </Link>
          )}
        </div>
      )}
    </Page>
  );
}
