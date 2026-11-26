import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PASSWORD_REQUIREMENTS, registerSchema } from "@nivo/shared";
import { Field, FieldGrid, FormSection, Page } from "../components/Page";
import { UserPlus } from "lucide-react";
import { Button } from "../components/Button";
import { GoogleSignInButton } from "../components/GoogleSignIn";
import { api, ApiError, formatApiError, legalVersionFromError } from "../lib/api";
import { useToast } from "../lib/toast";

/** Fallback if /v1/legal is unreachable — must match API DEFAULT_LEGAL. */
const FALLBACK_TERMS = "2025-11-draft1";
const FALLBACK_PRIVACY = "2025-11-draft1";

type Errors = Record<string, string>;

type Lookup =
  | { valid: false }
  | { valid: true; id: string; name: string; code: string; link: string };

export default function Register() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [termsVersion, setTermsVersion] = useState(FALLBACK_TERMS);
  const [privacyVersion, setPrivacyVersion] = useState(FALLBACK_PRIVACY);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "",
    intake: "",
    password: "",
    referralCode: params.get("ref") ?? "",
    ageConfirmed: false,
    accepted: false,
    shareProgressWithConsultancy: Boolean(params.get("ref")),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [referralLookup, setReferralLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    void api
      .get<{ documents: { slug: string; version: string }[] }>("/v1/legal")
      .then((res) => {
        const terms = res.documents.find((d) => d.slug === "terms");
        const privacy = res.documents.find((d) => d.slug === "privacy");
        if (terms?.version) setTermsVersion(terms.version);
        if (privacy?.version) setPrivacyVersion(privacy.version);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const code = form.referralCode.trim();
    if (!code) {
      setReferralLookup(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void api
        .get<Lookup>(`/v1/consultancy/lookup?code=${encodeURIComponent(code)}`)
        .then((res) => {
          if (!cancelled) setReferralLookup(res);
        })
        .catch(() => {
          if (!cancelled) setReferralLookup({ valid: false });
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [form.referralCode]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const code = form.referralCode.trim();
    if (code && referralLookup && !referralLookup.valid) {
      setErrors({ referralCode: "That referral code is not recognised." });
      return;
    }
    const parsed = registerSchema.safeParse({
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      country: form.country,
      intake: form.intake,
      password: form.password,
      ageConfirmed: form.ageConfirmed,
      acceptedTermsVersion: form.accepted ? termsVersion : "",
      acceptedPrivacyVersion: form.accepted ? privacyVersion : "",
      referralCode: code || undefined,
      shareProgressWithConsultancy: form.shareProgressWithConsultancy,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        const mapped = key === "acceptedTermsVersion" || key === "acceptedPrivacyVersion" ? "accepted" : key;
        next[mapped] ??= issue.message === "Required" || issue.code === "invalid_literal" ? "Required" : issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post("/v1/auth/register", parsed.data);
      navigate("/verify-email", { state: { email: parsed.data.email } });
    } catch (err) {
      if (err instanceof ApiError && err.code === "TERMS_REACCEPT_REQUIRED") {
        const terms = legalVersionFromError(err, "terms");
        const privacy = legalVersionFromError(err, "privacy");
        if (terms) setTermsVersion(terms);
        if (privacy) setPrivacyVersion(privacy);
        set("accepted", false);
        setErrors({
          accepted: err.message || "These documents were updated. Please accept the current version to continue.",
        });
        toast.info("Please accept the current terms", "They changed. Tick the box again to continue.");
        return;
      }
      toast.error(
        "Could not create account",
        formatApiError(err, "Check the form and try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  const validOrg = referralLookup?.valid ? referralLookup : null;

  return (
    <Page
      title="Create your account"
      intro={
        validOrg
          ? `You’re joining via ${validOrg.name}. Start your new beginning with NIVO.`
          : "Start your new beginning with NIVO."
      }
      narrow
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormSection title="Agreements" description="Required before we create your account.">
          <label className="flex min-h-tap items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange" checked={form.ageConfirmed} onChange={(e) => set("ageConfirmed", e.target.checked)} />
            <span>I confirm that I am at least 18 years old.</span>
          </label>
          {errors.ageConfirmed && <p role="alert" className="text-xs font-medium text-red-700">Please confirm your age.</p>}
          <label className="flex min-h-tap items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange" checked={form.accepted} onChange={(e) => set("accepted", e.target.checked)} />
            <span>
              I accept the{" "}
              <Link to="/terms" className="text-orange-dark underline">Terms</Link> and have read the{" "}
              <Link to="/privacy" className="text-orange-dark underline">Privacy Policy</Link>
              <span className="text-charcoal-soft"> (v{termsVersion})</span>.
            </span>
          </label>
          {errors.accepted && <p role="alert" className="text-xs font-medium text-red-700">Please accept the Terms and Privacy Policy.</p>}
        </FormSection>

        <GoogleSignInButton
          referralCode={form.referralCode.trim() || undefined}
          shareProgressWithConsultancy={form.shareProgressWithConsultancy}
          termsVersion={termsVersion}
          privacyVersion={privacyVersion}
          requireTerms
          termsAccepted={form.accepted && form.ageConfirmed}
        />

        <FormSection title="Your details" description="Name exactly as in your passport.">
          <FieldGrid>
            <Field label="Full name" error={errors.fullName} className="sm:col-span-2">
              <input className="input" autoComplete="name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
            </Field>
            <Field label="Email" error={errors.email}>
              <input className="input" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone" hint="e.g. +491234567890" error={errors.phone}>
              <input className="input" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Country" error={errors.country}>
              <input className="input" autoComplete="country-name" value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <Field label="Intake" hint="e.g. Winter 2027" error={errors.intake}>
              <input className="input" value={form.intake} onChange={(e) => set("intake", e.target.value)} />
            </Field>
            <Field label="Password" hint={PASSWORD_REQUIREMENTS} error={errors.password} className="sm:col-span-2">
              <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Referral" description="Optional — from your consultancy’s join link.">
          <Field label="Referral code" error={errors.referralCode} hint={validOrg ? `Recognised: ${validOrg.name}` : undefined}>
            <input className="input" value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} />
          </Field>
          {form.referralCode.trim() && referralLookup && !referralLookup.valid && (
            <p role="alert" className="text-xs font-medium text-red-700">That referral code is not recognised.</p>
          )}
          {Boolean(form.referralCode.trim()) && (
            <label className="flex min-h-tap items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-orange"
                checked={form.shareProgressWithConsultancy}
                onChange={(e) => set("shareProgressWithConsultancy", e.target.checked)}
              />
              <span>Share my progress with my consultancy.</span>
            </label>
          )}
        </FormSection>

        <Button type="submit" className="w-full" disabled={busy}>
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
          {busy ? "Creating account…" : "Register with email"}
        </Button>
        <p className="text-center text-sm">
          Already registered? <Link to="/login" className="font-medium text-orange-dark underline">Log in</Link>
        </p>
      </form>
    </Page>
  );
}
