import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Page } from "../components/Page";
import { Button } from "../components/Button";
import { api, ApiError, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Accommodation() {
  const { user } = useAuth();
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await api.post("/v1/accommodation/leads", {
        city: city.trim(),
        budget: budget.trim() || "flexible",
        roomType,
        phone: phone.trim(),
        notes: notes.trim() || undefined,
      });
      setStatus("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your request.");
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Accommodation" intro="Tell us what you’re looking for and an agent will get in touch." narrow>
      {status === "sent" ? (
        <p role="status" className="surface">
          Thanks — we’ll be in touch soon. You can track progress on your dashboard.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Preferred city">
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} required minLength={2} />
          </Field>
          <Field label="Monthly budget">
            <input
              className="input"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="e.g. 600–800 EUR"
              required
            />
          </Field>
          <Field label="Room type">
            <select className="input" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              <option value="shared">Shared room</option>
              <option value="private">Private room</option>
              <option value="studio">Studio</option>
              <option value="apartment">Apartment</option>
            </select>
          </Field>
          <Field label="Phone (international)" hint="e.g. +491701234567">
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+49…"
              required
            />
          </Field>
          <Field label="Notes (optional)">
            <textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </Field>
          {user && (
            <p className="text-xs text-charcoal-soft">Signed in as {user.email}. Payment must be complete to submit.</p>
          )}
          {status === "error" && error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Request help"}
          </Button>
        </form>
      )}
    </Page>
  );
}

type IdentityMasked = {
  complete: boolean;
  fullName: string | null;
  passportNumber: string | null;
  files: { id: string; kind: string; mime: string; sizeBytes: number }[];
};

type PaymentStatus = {
  status: string;
  invoices: { number: string; issuedAt: string }[];
};

export function Documents() {
  const [identity, setIdentity] = useState<IdentityMasked | null>(null);
  const [payments, setPayments] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<"passport" | "selfie" | "address_proof">("passport");

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [id, pay] = await Promise.all([
        api.get<IdentityMasked>("/v1/identity"),
        api.get<PaymentStatus>("/v1/payments/status"),
      ]);
      setIdentity(id);
      setPayments(pay);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load documents.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setError("Choose a PDF, JPEG or PNG file.");
      return;
    }
    setUploading(true);
    setError(undefined);
    try {
      await uploadFile(`/v1/identity/files?kind=${kind}`, file);
      input.value = "";
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Page title="Documents" intro="Invoices and identity files for your NIVO account.">
      {error && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{error}</p>}

      <section className="surface mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Invoices</h2>
        {payments?.invoices?.length ? (
          <ul className="space-y-2 text-sm">
            {payments.invoices.map((inv) => (
              <li key={inv.number} className="flex justify-between gap-3 border-b border-charcoal/10 pb-2">
                <span className="font-medium">{inv.number}</span>
                <span className="text-charcoal-soft">{new Date(inv.issuedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-charcoal-soft">No invoices yet. They appear after payment.</p>
        )}
        <p className="text-xs text-charcoal-soft">Payment status: {payments?.status ?? "—"}</p>
      </section>

      <section className="surface mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Identity summary</h2>
        {identity?.complete ? (
          <div className="text-sm space-y-1">
            <p>
              <span className="font-medium">Name:</span> {identity.fullName}
            </p>
            <p>
              <span className="font-medium">Passport:</span> {identity.passportNumber}
            </p>
          </div>
        ) : (
          <p className="text-sm text-charcoal-soft">Identity onboarding not completed yet.</p>
        )}
      </section>

      <section className="surface space-y-4">
        <h2 className="text-lg font-semibold">Uploaded files</h2>
        {identity?.files?.length ? (
          <ul className="space-y-2 text-sm">
            {identity.files.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2 border-b border-charcoal/10 pb-2">
                <span className="font-medium capitalize">{f.kind.replace("_", " ")}</span>
                <span className="text-charcoal-soft">
                  {f.mime} · {(f.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-charcoal-soft">No files uploaded yet.</p>
        )}

        <form onSubmit={onUpload} className="space-y-3 border-t border-charcoal/10 pt-4">
          <Field label="Document type">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="passport">Passport</option>
              <option value="selfie">Selfie</option>
              <option value="address_proof">Address proof</option>
            </select>
          </Field>
          <Field label="File (PDF, JPEG or PNG, max 5 MB)">
            <input className="input" type="file" name="file" accept=".pdf,image/jpeg,image/png" required />
          </Field>
          <Button type="submit" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload file"}
          </Button>
        </form>
      </section>
    </Page>
  );
}

export function Profile() {
  const { user, refresh } = useAuth();
  const [totpSecret, setTotpSecret] = useState<string>();
  const [totpUri, setTotpUri] = useState<string>();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function start2fa() {
    setError(undefined);
    setMessage(undefined);
    setBusy(true);
    try {
      const res = await api.post<{ secret: string; otpauthUrl: string }>("/v1/auth/2fa/setup");
      setTotpSecret(res.secret);
      setTotpUri(res.otpauthUrl); // authenticator key URI
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start 2FA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function enable2fa(e: FormEvent) {
    e.preventDefault();
    if (!totpSecret) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.post("/v1/auth/2fa/enable", { secret: totpSecret, code });
      setMessage("Two-factor authentication is enabled.");
      setTotpSecret(undefined);
      setTotpUri(undefined);
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not enable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const res = await api.post<{ status: string }>("/v1/me/deletion-request", { password });
      setMessage(
        res.status === "already_requested"
          ? "A deletion request is already on file."
          : "Deletion requested. Our team will process it according to our retention policy.",
      );
      setPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit deletion request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Profile" intro="Your account details and security settings.">
      <div className="surface mb-6 space-y-1 text-sm">
        <p>
          <span className="font-medium">Name:</span> {user?.fullName ?? "—"}
        </p>
        <p>
          <span className="font-medium">Email:</span> {user?.email ?? "—"}
        </p>
        <p>
          <span className="font-medium">Payment:</span> {user?.paymentStatus ?? "—"}
        </p>
        <p>
          <span className="font-medium">Identity:</span> {user?.identityComplete ? "Complete" : "Incomplete"}
        </p>
      </div>

      <section className="surface mb-6 space-y-3">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        {!totpSecret ? (
          <Button type="button" onClick={() => void start2fa()} disabled={busy}>
            Set up authenticator app
          </Button>
        ) : (
          <form onSubmit={enable2fa} className="space-y-3">
            <p className="text-sm text-charcoal-soft">
              Add this secret to your authenticator app, then enter the 6-digit code.
            </p>
            <p className="break-all rounded-xl bg-beige/60 p-3 font-mono text-xs">{totpSecret}</p>
            {totpUri && (
              <p className="break-all text-xs text-charcoal-soft">
                otpauth: <span className="font-mono">{totpUri}</span>
              </p>
            )}
            <Field label="Authentication code">
              <input
                className="input"
                inputMode="numeric"
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={busy || code.length !== 6}>
              Enable 2FA
            </Button>
          </form>
        )}
      </section>

      <section className="surface space-y-3">
        <h2 className="text-lg font-semibold">Request account deletion</h2>
        <p className="text-sm text-charcoal-soft">
          Confirm with your password. We will process the request under GDPR timelines.
        </p>
        <form onSubmit={requestDeletion} className="space-y-3">
          <Field label="Current password">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="btn-secondary" disabled={busy || !password}>
            Request deletion
          </Button>
        </form>
      </section>

      {message && (
        <p role="status" className="mt-4 text-sm font-medium text-orange-dark">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </Page>
  );
}
