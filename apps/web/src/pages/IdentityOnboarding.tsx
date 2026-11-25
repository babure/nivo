import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { identitySchema } from "@nivo/shared";
import { Field, FieldGrid, FormSection, Page } from "../components/Page";
import { Button } from "../components/Button";
import { OnboardingStepper } from "../components/OnboardingStepper";
import { api, ApiError } from "../lib/api";

const STEPS = ["Personal", "Family", "Address", "Passport"];

type Addr = { street: string; houseNumber: string; city: string; postalCode: string; country: string };
const emptyAddr: Addr = { street: "", houseNumber: "", city: "", postalCode: "", country: "" };

type Form = {
  fullName: string;
  email: string;
  phone: string;
  fatherName: string;
  motherName: string;
  currentAddress: Addr;
  permanentAddress: Addr;
  permanentSameAsCurrent: boolean;
  passportNumber: string;
  identityConsent: boolean;
};

const initial: Form = {
  fullName: "",
  email: "",
  phone: "",
  fatherName: "",
  motherName: "",
  currentAddress: emptyAddr,
  permanentAddress: emptyAddr,
  permanentSameAsCurrent: false,
  passportNumber: "",
  identityConsent: false,
};

const STEP_FIELDS: (keyof Form)[][] = [
  ["fullName", "email", "phone"],
  ["fatherName", "motherName"],
  ["currentAddress", "permanentAddress", "permanentSameAsCurrent"],
  ["passportNumber", "identityConsent"],
];

export default function IdentityOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setAddr = (which: "currentAddress" | "permanentAddress", k: keyof Addr, v: string) =>
    setForm((f) => ({ ...f, [which]: { ...f[which], [k]: v } }));

  const effective = (): Form =>
    form.permanentSameAsCurrent ? { ...form, permanentAddress: form.currentAddress } : form;

  function validateStep(): boolean {
    const mask = Object.fromEntries(STEP_FIELDS[step].map((k) => [k, true])) as Record<string, true>;
    const res = identitySchema.pick(mask as never).safeParse(effective());
    if (res.success) {
      setErrors({});
      return true;
    }
    const next: Record<string, string> = {};
    for (const i of res.error.issues) next[i.path.join(".")] ??= i.message === "Required" ? "Required" : i.message;
    setErrors(next);
    return false;
  }

  async function next() {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) return setStep(step + 1);
    setBusy(true);
    setFormError(undefined);
    try {
      await api.put("/v1/identity", identitySchema.parse(effective()));
      navigate("/dashboard");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save your details.");
    } finally {
      setBusy(false);
    }
  }

  const text = (label: string, key: keyof Form, props: Record<string, string> = {}) => (
    <Field label={label} error={errors[key]}>
      <input className="input" value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} {...props} />
    </Field>
  );

  const addressFields = (which: "currentAddress" | "permanentAddress", title: string, disabled = false) => (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-charcoal">{title}</legend>
      <FieldGrid>
        {(
          [
            ["Street", "street"],
            ["House number", "houseNumber"],
            ["City", "city"],
            ["Postal code", "postalCode"],
            ["Country", "country"],
          ] as [string, keyof Addr][]
        ).map(([label, k]) => (
          <Field key={k} label={label} error={errors[`${which}.${k}`]} className={k === "street" ? "sm:col-span-2" : undefined}>
            <input className="input" value={form[which][k]} onChange={(e) => setAddr(which, k, e.target.value)} />
          </Field>
        ))}
      </FieldGrid>
    </fieldset>
  );

  return (
    <Page
      title="Your details"
      intro="Encrypted and only used for your NIVO services."
      compact
    >
      <div className="space-y-4">
        <OnboardingStepper steps={STEPS} current={step} />
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          {step === 0 && (
            <FormSection title="Personal" description="Use your name exactly as in your passport.">
              <FieldGrid>
                {text("Full name (as on passport)", "fullName", { autoComplete: "name" })}
                {text("Email", "email", { type: "email", autoComplete: "email" })}
                {text("Phone", "phone", { type: "tel", autoComplete: "tel" })}
              </FieldGrid>
            </FormSection>
          )}
          {step === 1 && (
            <FormSection title="Family">
              <FieldGrid>
                {text("Father’s name", "fatherName")}
                {text("Mother’s name", "motherName")}
              </FieldGrid>
            </FormSection>
          )}
          {step === 2 && (
            <FormSection title="Address">
              {addressFields("currentAddress", "Current address")}
              <label className="flex min-h-tap items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-orange"
                  checked={form.permanentSameAsCurrent}
                  onChange={(e) => set("permanentSameAsCurrent", e.target.checked)}
                />
                Permanent address is the same as current
              </label>
              {!form.permanentSameAsCurrent && addressFields("permanentAddress", "Permanent address")}
            </FormSection>
          )}
          {step === 3 && (
            <FormSection title="Passport & consent">
              {text("Passport number", "passportNumber")}
              <label className="flex min-h-tap items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-orange"
                  checked={form.identityConsent}
                  onChange={(e) => set("identityConsent", e.target.checked)}
                />
                <span>I consent to NIVO processing my identity data to provide my services.</span>
              </label>
              {errors.identityConsent && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  Consent is required.
                </p>
              )}
            </FormSection>
          )}

          {formError && <p role="alert" className="text-sm font-medium text-red-700">{formError}</p>}

          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="secondary" className="flex-1" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={busy}>
              {step === STEPS.length - 1 ? (busy ? "Saving…" : "Submit") : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </Page>
  );
}
