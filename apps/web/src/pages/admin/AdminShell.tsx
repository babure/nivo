import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { CARD_STATUSES, hasPermission, type Permission } from "@nivo/shared";
import { Login } from "../AuthPages";
import { Field, Page } from "../../components/Page";
import { Button } from "../../components/Button";
import { PermissionGate } from "../../components/guards";
import { WorkspaceShell } from "../../components/WorkspaceShell";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

type AdminSection = { path: string; label: string; permission: Permission; description: string };

export const ADMIN_SECTIONS: AdminSection[] = [
  { path: "students", label: "Students", permission: "students:read", description: "Browse and manage students." },
  { path: "approvals", label: "Approvals", permission: "approvals:decide", description: "Decide pending maker-checker requests." },
  { path: "settings", label: "Settings", permission: "settings:links:edit", description: "Links, SIM rules and content settings." },
  { path: "leads", label: "Leads", permission: "leads:read", description: "Accommodation and partner leads." },
  { path: "reports", label: "Reports", permission: "audit:read", description: "Audit log and exports." },
];

function AdminLayout() {
  const { user, ready, signOut } = useAuth();
  const perms = user?.permissions ?? [];
  const visible = ADMIN_SECTIONS.filter((s) => hasPermission(perms, s.permission));

  if (!ready) return <p className="p-8 text-center text-sm text-charcoal-soft">Checking your session…</p>;
  if (!user || user.role !== "admin") return <Navigate to="/admin/login" replace />;

  return (
    <WorkspaceShell
      brandHref="/admin/students"
      eyebrow="Admin"
      title="Admin"
      nav={visible.map((s) => ({
        to: `/admin/${s.path}`,
        label: s.label,
        description: s.description,
      }))}
      userSlot={
        <div className="space-y-2">
          <p className="truncate px-1 text-xs text-charcoal-soft">{user.email}</p>
          <button
            type="button"
            className="text-sm font-medium text-charcoal-soft underline-offset-4 hover:text-charcoal hover:underline"
            onClick={() => void signOut()}
          >
            Log out
          </button>
        </div>
      }
    >
      <Outlet />
    </WorkspaceShell>
  );
}

type StudentRow = {
  id: string;
  fullName: string;
  email?: string;
  country: string;
  intake: string;
  emailVerified: boolean;
  paymentStatus: string;
  identityComplete: boolean;
  createdAt: string;
};

function StudentsPanel() {
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [reveal, setReveal] = useState<unknown>();

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ students: StudentRow[] }>("/v1/admin/students");
      setStudents(res.students);
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load students.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid(id: string) {
    setBusyId(id);
    setMessage(undefined);
    setError(undefined);
    try {
      const res = await api.post<{ status?: string; approvalId?: string }>(
        `/v1/admin/students/${id}/mark-paid`,
        { reason: "Manual mark paid from admin students panel." },
      );
      if (res?.status === "pending_approval") {
        setMessage(`Mark-paid submitted for approval (${res.approvalId?.slice(0, 8)}…).`);
      } else {
        setMessage("Student marked as paid.");
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mark paid failed.");
    } finally {
      setBusyId(undefined);
    }
  }

  async function setCard(id: string, key: string, status: string) {
    setBusyId(id);
    setError(undefined);
    try {
      await api.post(`/v1/admin/students/${id}/cards/${key}/status`, {
        status,
        reason: `Admin set ${key} to ${status} from students panel.`,
      });
      setMessage(`Updated ${key} → ${status}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Card update failed.");
    } finally {
      setBusyId(undefined);
    }
  }

  async function revealIdentity(id: string) {
    setBusyId(id);
    setError(undefined);
    setReveal(undefined);
    try {
      const res = await api.post<Record<string, unknown>>(`/v1/admin/students/${id}/identity/reveal`, {
        reason: "Support review from admin students panel.",
      });
      if (res?.status === "pending_approval") {
        setMessage(`Identity reveal submitted for approval (${String(res.approvalId).slice(0, 8)}…).`);
      } else {
        setReveal(res);
        setMessage("Identity revealed (sensitive — handle carefully).");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reveal failed.");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <Page title="Students" intro="Browse and manage student accounts.">
      {error && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{error}</p>}
      {message && <p role="status" className="mb-3 text-sm font-medium text-orange-dark">{message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-beige/50 text-xs uppercase tracking-wide text-charcoal-soft">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Identity</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t border-charcoal/10 align-top">
                <td className="px-3 py-3">
                  <div className="font-medium">{s.fullName}</div>
                  <div className="text-xs text-charcoal-soft">{s.email ?? s.id.slice(0, 8)}</div>
                  <div className="text-xs text-charcoal-soft">{s.intake}</div>
                </td>
                <td className="px-3 py-3">{s.country}</td>
                <td className="px-3 py-3 capitalize">{s.paymentStatus}</td>
                <td className="px-3 py-3">{s.identityComplete ? "Complete" : "Incomplete"}</td>
                <td className="px-3 py-3 space-y-2">
                  {hasPermission(perms, "students:mark_paid") && s.paymentStatus !== "paid" && (
                    <Button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={busyId === s.id}
                      onClick={() => void markPaid(s.id)}
                    >
                      Mark paid
                    </Button>
                  )}
                  {hasPermission(perms, "students:set_card_status") && (
                    <div className="flex flex-wrap gap-1">
                      {(["blocked_account", "sim", "accommodation"] as const).map((key) => (
                        <select
                          key={key}
                          className="input py-1 text-xs"
                          defaultValue=""
                          disabled={busyId === s.id}
                          onChange={(e) => {
                            const status = e.target.value;
                            if (status) void setCard(s.id, key, status);
                            e.target.value = "";
                          }}
                        >
                          <option value="">{key}</option>
                          {CARD_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              → {st}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                  )}
                  {hasPermission(perms, "identity:reveal") && s.identityComplete && (
                    <Button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={busyId === s.id}
                      onClick={() => void revealIdentity(s.id)}
                    >
                      Reveal identity
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length === 0 && <p className="p-4 text-sm text-charcoal-soft">No students yet.</p>}
      </div>
      {reveal != null && (
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-charcoal p-4 text-xs text-beige">
          {JSON.stringify(reveal, null, 2)}
        </pre>
      )}
    </Page>
  );
}

type Lead = {
  id: string;
  userId: string;
  city: string;
  budget: string;
  roomType: string;
  notes: string;
  phone: string;
  status: string;
  createdAt: string;
};

const LEAD_STATUSES = ["new", "contacted", "viewing", "booked", "closed"] as const;

function LeadsPanel() {
  const { user } = useAuth();
  const canUpdate = hasPermission(user?.permissions ?? [], "leads:update_status");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ leads: Lead[] }>("/v1/accommodation/leads");
      setLeads(res.leads);
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load leads.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, status: string) {
    try {
      await api.patch(`/v1/accommodation/leads/${id}`, { status });
      setMessage(`Lead updated to ${status}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed.");
    }
  }

  async function addNote(id: string) {
    const body = notes[id]?.trim();
    if (!body) return;
    try {
      await api.post(`/v1/accommodation/leads/${id}/notes`, { body });
      setNotes((n) => ({ ...n, [id]: "" }));
      setMessage("Note added.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add note.");
    }
  }

  return (
    <Page title="Leads" intro="Accommodation requests from students.">
      {error && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{error}</p>}
      {message && <p role="status" className="mb-3 text-sm font-medium text-orange-dark">{message}</p>}
      <div className="space-y-4">
        {leads.map((lead) => (
          <article key={lead.id} className="surface space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {lead.city} · {lead.roomType}
                </h2>
                <p className="text-sm text-charcoal-soft">
                  Budget {lead.budget} · {lead.phone}
                </p>
                {lead.notes && <p className="mt-1 text-sm">{lead.notes}</p>}
              </div>
              <span className="rounded-full bg-beige px-3 py-1 text-xs font-medium capitalize">{lead.status}</span>
            </div>
            {canUpdate && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="input"
                  value={lead.status}
                  onChange={(e) => void updateStatus(lead.id, e.target.value)}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  className="input flex-1"
                  placeholder="Add a note…"
                  value={notes[lead.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [lead.id]: e.target.value }))}
                />
                <Button type="button" className="btn-secondary" onClick={() => void addNote(lead.id)}>
                  Add note
                </Button>
              </div>
            )}
          </article>
        ))}
        {leads.length === 0 && <p className="text-sm text-charcoal-soft">No leads yet.</p>}
      </div>
    </Page>
  );
}

function SettingsPanel() {
  const [links, setLinks] = useState({ expatrio: "", vodafone: "", swarajya: "" });
  const [simRules, setSimRules] = useState("blocked_account");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void api
      .get<{ links: Record<string, string>; simRules: string[] }>("/v1/admin/settings")
      .then((res) => {
        setLinks({
          expatrio: res.links.expatrio ?? "",
          vodafone: res.links.vodafone ?? "",
          swarajya: res.links.swarajya ?? "",
        });
        setSimRules((res.simRules ?? []).join(", "));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load settings."));
  }, []);

  async function saveLinks(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      await api.put("/v1/admin/settings/links", { links });
      setMessage("Partner links saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save links.");
    }
  }

  async function saveSim(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      const requiredCardKeys = simRules
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.put("/v1/admin/settings/sim-rules", { requiredCardKeys });
      setMessage("SIM unlock rules saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save SIM rules.");
    }
  }

  return (
    <Page title="Settings" intro="Partner links and SIM unlock rules.">
      {error && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{error}</p>}
      {message && <p role="status" className="mb-3 text-sm font-medium text-orange-dark">{message}</p>}
      <form onSubmit={saveLinks} className="surface mb-6 space-y-3">
        <h2 className="font-semibold">Partner links</h2>
        {(["expatrio", "vodafone", "swarajya"] as const).map((key) => (
          <Field key={key} label={key}>
            <input
              className="input"
              value={links[key]}
              onChange={(e) => setLinks((l) => ({ ...l, [key]: e.target.value }))}
              required
            />
          </Field>
        ))}
        <Button type="submit">Save links</Button>
      </form>
      <form onSubmit={saveSim} className="surface space-y-3">
        <h2 className="font-semibold">SIM unlock required cards</h2>
        <Field label="Comma-separated card keys" hint="Default: blocked_account">
          <input className="input" value={simRules} onChange={(e) => setSimRules(e.target.value)} />
        </Field>
        <Button type="submit">Save SIM rules</Button>
      </form>
    </Page>
  );
}

type Approval = {
  id: string;
  action: string;
  status: string;
  requesterEmail: string;
  requesterId: string;
  targetUserId: string;
  reason: string;
  createdAt: string;
};

function ApprovalsPanel() {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ approvals: Approval[] }>("/v1/admin/approvals?status=pending");
      setApprovals(res.approvals);
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load approvals.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    try {
      await api.post(`/v1/admin/approvals/${id}/decide`, { decision });
      setMessage(`Request ${decision}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Decision failed.");
    }
  }

  return (
    <Page title="Approvals" intro="Maker-checker queue for sensitive admin actions.">
      {error && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{error}</p>}
      {message && <p role="status" className="mb-3 text-sm font-medium text-orange-dark">{message}</p>}
      <div className="space-y-3">
        {approvals.map((a) => (
          <article key={a.id} className="surface space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-semibold">{a.action}</h2>
              <span className="text-xs capitalize text-charcoal-soft">{a.status}</span>
            </div>
            <p className="text-sm">
              From {a.requesterEmail} → student {a.targetUserId.slice(0, 8)}…
            </p>
            <p className="text-sm text-charcoal-soft">{a.reason}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={a.requesterId === user?.id}
                onClick={() => void decide(a.id, "approved")}
              >
                Approve
              </Button>
              <Button
                type="button"
                className="btn-secondary"
                disabled={a.requesterId === user?.id}
                onClick={() => void decide(a.id, "rejected")}
              >
                Reject
              </Button>
            </div>
          </article>
        ))}
        {approvals.length === 0 && <p className="text-sm text-charcoal-soft">No pending approvals.</p>}
      </div>
    </Page>
  );
}

function ReportsPanel() {
  const [entries, setEntries] = useState<
    { id: string; at: string; actorId: string | null; action: string; entityType: string | null; entityId: string | null }[]
  >([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .get<{ chain: { valid: boolean }; entries: typeof entries }>("/v1/admin/audit")
      .then((res) => {
        setEntries(res.entries);
        setChainValid(res.chain.valid);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load audit."));
  }, []);

  return (
    <Page title="Reports" intro="Recent audit events.">
      {error && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{error}</p>}
      {chainValid !== null && (
        <p className="mb-3 text-sm">
          Audit chain:{" "}
          <span className={chainValid ? "text-green-800" : "text-red-700"}>
            {chainValid ? "valid" : "tampered"}
          </span>
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-beige/50 text-xs uppercase text-charcoal-soft">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Entity</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-charcoal/10">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(e.at).toLocaleString()}</td>
                <td className="px-3 py-2 font-medium">{e.action}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.actorId?.slice(0, 8) ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {e.entityType ?? "—"} {e.entityId ? `· ${e.entityId.slice(0, 12)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <p className="p-4 text-sm text-charcoal-soft">No audit entries.</p>}
      </div>
    </Page>
  );
}

export default function AdminRoutes() {
  const { user } = useAuth();
  const first = ADMIN_SECTIONS.find((s) => hasPermission(user?.permissions ?? [], s.permission));
  return (
    <Routes>
      <Route path="login" element={<Login kind="admin" />} />
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to={first ? first.path : "students"} replace />} />
        <Route
          path="students"
          element={
            <PermissionGate permission="students:read">
              <StudentsPanel />
            </PermissionGate>
          }
        />
        <Route
          path="approvals"
          element={
            <PermissionGate permission="approvals:decide">
              <ApprovalsPanel />
            </PermissionGate>
          }
        />
        <Route
          path="settings"
          element={
            <PermissionGate permission="settings:links:edit">
              <SettingsPanel />
            </PermissionGate>
          }
        />
        <Route
          path="leads"
          element={
            <PermissionGate permission="leads:read">
              <LeadsPanel />
            </PermissionGate>
          }
        />
        <Route
          path="reports"
          element={
            <PermissionGate permission="audit:read">
              <ReportsPanel />
            </PermissionGate>
          }
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
