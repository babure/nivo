import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { identitySchema } from "@nivo/shared";
import { Field, FieldGrid, FormSection, Page } from "../components/Page";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "../components/Button";
import { OnboardingStepper } from "../components/OnboardingStepper";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

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

const emptyForm: Form = {
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
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Account email/name/phone already known from login or Google — never ask again.
  useEffect(() => {
    if (!user || prefilled) return;
    setForm((f) => ({
      ...f,
      email: user.email,
      fullName: f.fullName || user.fullName || "",
      phone: f.phone || user.phone || "",
    }));
    setPrefilled(true);
  }, [user, prefilled]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setAddr = (which: "currentAddress" | "permanentAddress", k: keyof Addr, v: string) =>
    setForm((f) => ({ ...f, [which]: { ...f[which], [k]: v } }));

  const effective = (): Form => {
    const base = {
      ...form,
      email: user?.email ?? form.email,
    };
    return base.permanentSameAsCurrent ? { ...base, permanentAddress: base.currentAddress } : base;
  };

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
    try {
      await api.put("/v1/identity", identitySchema.parse(effective()));
      toast.success("Details saved");
      navigate("/dashboard");
    } catch (err) {
      toast.error(
        "Could not save your details",
        formatApiError(err, "Fix highlighted fields and try again."),
      );
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
    <Page title="Your details" intro="Encrypted and only used for your NIVO services." wide compact>
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
                <Field
                  label="Email"
                  hint="From your NIVO account — change it in profile if needed."
                  error={errors.email}
                >
                  <input
                    className="input bg-mist/50 text-charcoal-soft"
                    type="email"
                    value={user?.email ?? form.email}
                    readOnly
                    aria-readonly="true"
                    autoComplete="email"
                  />
                </Field>
                {text("Phone", "phone", {
                  type: "tel",
                  autoComplete: "tel",
                  ...(user?.phone ? {} : { placeholder: "+49…" }),
                })}
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

          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="secondary" className="flex-1" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                Back
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={busy}>
              {step === STEPS.length - 1 ? (
                <>
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                  {busy ? "Saving…" : "Submit"}
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Page>
  );
}
