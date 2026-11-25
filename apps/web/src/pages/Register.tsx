import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { registerSchema } from "@nivo/shared";
import { Field, FieldGrid, FormSection, Page } from "../components/Page";
import { Button } from "../components/Button";
import { GoogleSignInButton } from "../components/GoogleSignIn";
import { api, ApiError } from "../lib/api";

/** Fallback if /v1/legal is unreachable — must match API DEFAULT_LEGAL. */
const FALLBACK_TERMS = "2025-01";
const FALLBACK_PRIVACY = "2025-01";

type Errors = Record<string, string>;

export default function Register() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
    shareProgressWithConsultancy: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

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

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
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
      referralCode: form.referralCode || undefined,
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
      setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Create your account" intro="Start your new beginning with NIVO." narrow>
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
            <Field label="Password" hint="12+ chars, upper, lower, number" error={errors.password} className="sm:col-span-2">
              <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Referral" description="Optional — from your consultancy link.">
          <Field label="Referral code">
            <input className="input" value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} />
          </Field>
          <label className="flex min-h-tap items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange" checked={form.shareProgressWithConsultancy} onChange={(e) => set("shareProgressWithConsultancy", e.target.checked)} />
            <span>Share my progress with my consultancy.</span>
          </label>
        </FormSection>

        {formError && <p role="alert" className="text-sm font-medium text-red-700">{formError}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Register with email"}
        </Button>
        <p className="text-center text-sm">
          Already registered? <Link to="/login" className="font-medium text-orange-dark underline">Log in</Link>
        </p>
      </form>
    </Page>
  );
}
