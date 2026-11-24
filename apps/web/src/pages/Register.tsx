import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { registerSchema } from "@nivo/shared";
import { Field, Page } from "../components/Page";
import { Button } from "../components/Button";
import { api, ApiError } from "../lib/api";

const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";

type Errors = Record<string, string>;

export default function Register() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
      acceptedTermsVersion: form.accepted ? TERMS_VERSION : "",
      acceptedPrivacyVersion: form.accepted ? PRIVACY_VERSION : "",
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
        <Field label="Full name" error={errors.fullName}>
          <input className="input" autoComplete="name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className="input" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone" hint="International format, e.g. +491234567890" error={errors.phone}>
          <input className="input" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Country" error={errors.country}>
          <input className="input" autoComplete="country-name" value={form.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="Intake" hint="e.g. Winter 2027" error={errors.intake}>
          <input className="input" value={form.intake} onChange={(e) => set("intake", e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 12 characters with upper, lower and a number" error={errors.password}>
          <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </Field>
        <Field label="Referral code (optional)">
          <input className="input" value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} />
        </Field>

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
            <Link to="/privacy" className="text-orange-dark underline">Privacy Policy</Link>.
          </span>
        </label>
        {errors.accepted && <p role="alert" className="text-xs font-medium text-red-700">Please accept the Terms and Privacy Policy.</p>}

        <label className="flex min-h-tap items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange" checked={form.shareProgressWithConsultancy} onChange={(e) => set("shareProgressWithConsultancy", e.target.checked)} />
          <span>Share my progress with my consultancy (optional).</span>
        </label>

        {formError && <p role="alert" className="text-sm font-medium text-red-700">{formError}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Register"}
        </Button>
        <p className="text-center text-sm">
          Already registered? <Link to="/login" className="font-medium text-orange-dark underline">Log in</Link>
        </p>
      </form>
    </Page>
  );
}
