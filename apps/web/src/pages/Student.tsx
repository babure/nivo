import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Field, Page } from "../components/Page";
import { Button } from "../components/Button";
import { api, ApiError, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";

type Lead = {
  id: string;
  status: string;
  city: string;
  budget: string;
  roomType: string;
  createdAt: string;
};

export function Accommodation() {
  const { user } = useAuth();
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);

  const loadLeads = useCallback(async () => {
    try {
      const res = await api.get<{ leads: Lead[] }>("/v1/accommodation/mine");
      setLeads(res.leads);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

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
      await loadLeads();
      setCity("");
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your request.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/v1/accommodation/leads/${id}/withdraw`);
      await loadLeads();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not withdraw enquiry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Housing" intro="Tell us city, budget and room type. An agent follows up with leads." narrow>
      {leads.length > 0 && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-charcoal-soft">Your enquiries</h2>
          {leads.map((l) => (
            <div key={l.id} className="rounded-xl border border-charcoal/10 bg-white p-4 text-sm">
              <p className="font-medium">
                {l.city} · {l.roomType} · {l.budget}
              </p>
              <p className="mt-1 text-charcoal-soft">
                Status: <span className="font-semibold text-charcoal">{l.status}</span>
              </p>
              {l.status !== "closed" && l.status !== "booked" && (
                <Button variant="secondary" className="mt-3" disabled={busy} onClick={() => void withdraw(l.id)}>
                  Withdraw
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

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
          <p className="text-xs text-charcoal-soft">
            Signed in as {user.email}. Payment and identity must be complete to submit.
          </p>
        )}
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending…" : "Request help"}
        </Button>
      </form>
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
  invoices: { number: string; issuedAt: string; documentId?: string | null }[];
};

export function Documents() {
  const [identity, setIdentity] = useState<IdentityMasked | null>(null);
  const [payments, setPayments] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<"passport" | "selfie" | "address_proof" | "signature">("passport");
  const [exporting, setExporting] = useState(false);

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

  async function onUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      await uploadFile(`/v1/identity/files?kind=${kind}`, file);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function exportIdentity() {
    setExporting(true);
    setError(undefined);
    try {
      const data = await api.get<unknown>("/v1/identity/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nivo-identity-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Page title="Papers" intro="Invoices and encrypted identity uploads in one place." narrow>
      {error && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{error}</p>}
      <section className="mb-8 space-y-3">
        <h2 className="font-semibold">Invoices</h2>
        {payments?.invoices?.length ? (
          <ul className="space-y-2 text-sm">
            {payments.invoices.map((inv) => (
              <li key={inv.number} className="rounded-xl border border-charcoal/10 bg-white px-4 py-3">
                {inv.number}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-charcoal-soft">No invoices yet.</p>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Identity files</h2>
          <Button variant="secondary" disabled={exporting} onClick={() => void exportIdentity()}>
            {exporting ? "Exporting…" : "Export my data"}
          </Button>
        </div>
        {identity?.complete && (
          <p className="text-sm text-charcoal-soft">
            Masked: {identity.fullName} · passport {identity.passportNumber}
          </p>
        )}
        <ul className="space-y-2 text-sm">
          {(identity?.files ?? []).map((f) => (
            <li key={f.id} className="rounded-xl border border-charcoal/10 bg-white px-4 py-3">
              {f.kind} · {f.mime} · {Math.round(f.sizeBytes / 1024)} KB
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Upload kind">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="passport">Passport scan</option>
              <option value="selfie">Selfie</option>
              <option value="address_proof">Address proof</option>
              <option value="signature">Signature PNG</option>
            </select>
          </Field>
          <input
            type="file"
            accept={kind === "signature" ? "image/png" : "image/jpeg,image/png,application/pdf"}
            disabled={uploading}
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
          />
        </div>
      </section>
    </Page>
  );
}

export function Profile() {
  const { user, refresh, signOut } = useAuth();
  const [secret, setSecret] = useState<string>();
  const [otpauthUrl, setOtpauthUrl] = useState<string>();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  async function begin2fa() {
    setErr(undefined);
    try {
      const res = await api.post<{ secret: string; otpauthUrl: string }>("/v1/auth/2fa/setup");
      setSecret(res.secret);
      setOtpauthUrl(res.otpauthUrl);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not start 2FA setup.");
    }
  }

  async function enable2fa(e: FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setErr(undefined);
    try {
      await api.post("/v1/auth/2fa/enable", { secret, code });
      setMsg("Two-factor authentication enabled.");
      setSecret(undefined);
      setCode("");
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Invalid code.");
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setErr(undefined);
    try {
      await api.post("/v1/me/password", {
        password,
        ...(user?.passwordSet ? { currentPassword } : {}),
      });
      setMsg("Password updated.");
      setPassword("");
      setCurrentPassword("");
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not update password.");
    }
  }

  async function requestDeletion(e: FormEvent) {
    e.preventDefault();
    setErr(undefined);
    try {
      await api.post("/v1/me/deletion-request", {
        ...(user?.passwordSet ? { password: currentPassword || password } : { confirmEmail }),
      });
      setMsg("Deletion requested. We’ll process it shortly.");
      await signOut();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not request deletion.");
    }
  }

  function paint(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2D2A26";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  async function uploadSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setErr(undefined);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("empty");
      const file = new File([blob], "signature.png", { type: "image/png" });
      await uploadFile("/v1/identity/files?kind=signature", file);
      setMsg("Signature saved (encrypted).");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save signature.");
    }
  }

  return (
    <Page title="You" intro="Security, signature and privacy for your account." narrow>
      {msg && <p role="status" className="mb-4 text-sm text-green-800">{msg}</p>}
      {err && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{err}</p>}

      <section className="mb-8 space-y-3">
        <h2 className="font-semibold">Two-factor authentication</h2>
        <p className="text-sm text-charcoal-soft">
          Required for admin and consultancy accounts. Students may enable it optionally.
        </p>
        {!secret ? (
          <Button onClick={() => void begin2fa()}>Set up authenticator</Button>
        ) : (
          <form onSubmit={enable2fa} className="space-y-3">
            <p className="break-all text-xs text-charcoal-soft">{otpauthUrl}</p>
            <Field label="Code from authenticator">
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required pattern="\d{6}" />
            </Field>
            <Button type="submit">Enable 2FA</Button>
          </form>
        )}
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-semibold">Signature</h2>
        <canvas
          ref={canvasRef}
          width={320}
          height={120}
          className="w-full max-w-sm touch-none rounded-xl border border-charcoal/15 bg-white"
          onPointerDown={(e) => {
            drawing.current = true;
            const rect = e.currentTarget.getBoundingClientRect();
            paint(e.clientX - rect.left, e.clientY - rect.top);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            paint(e.clientX - rect.left, e.clientY - rect.top);
          }}
          onPointerUp={() => {
            drawing.current = false;
            canvasRef.current?.getContext("2d")?.beginPath();
          }}
        />
        <Button variant="secondary" onClick={() => void uploadSignature()}>
          Save signature PNG
        </Button>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-semibold">{user?.passwordSet ? "Change password" : "Set password"}</h2>
        <form onSubmit={changePassword} className="space-y-3">
          {user?.passwordSet && (
            <Field label="Current password">
              <input
                className="input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
          )}
          <Field label="New password">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
            />
          </Field>
          <Button type="submit">Save password</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Request account deletion</h2>
        <form onSubmit={requestDeletion} className="space-y-3">
          {user?.passwordSet ? (
            <Field label="Confirm with password">
              <input
                className="input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
          ) : (
            <Field label="Type your email to confirm">
              <input
                className="input"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                required
              />
            </Field>
          )}
          <Button type="submit" variant="secondary">
            Request account deletion
          </Button>
        </form>
      </section>
    </Page>
  );
}
