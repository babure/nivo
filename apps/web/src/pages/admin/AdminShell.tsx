import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import {
  BadgeCheck,
  Banknote,
  Building2,
  Check,
  Copy,
  Eye,
  FileBarChart,
  FileDown,
  Handshake,
  Home,
  LayoutDashboard,
  Layers,
  RefreshCw,
  Save,
  Scale,
  ScanFace,
  Settings,
  Settings2,
  StickyNote,
  UserCog,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  CARD_STATUSES,
  PASSWORD_REQUIREMENTS,
  addManagerSchema,
  createAdminSchema,
  createConsultancySchema,
  hasPermission,
  type Permission,
} from "@nivo/shared";
import { Login } from "../AuthPages";
import { Field, FieldGrid, FormSection, Page } from "../../components/Page";
import { Button } from "../../components/Button";
import { PermissionGate } from "../../components/guards";
import { ActionTable, type ActionColumn } from "../../components/ActionTable";
import { AsyncContent } from "../../components/AsyncContent";
import { DataTable } from "../../components/DataTable";
import { Dialog } from "../../components/Dialog";
import { IdentityRevealDialog, type RevealedIdentity } from "../../components/IdentityRevealDialog";
import { PathStatusStrip } from "../../components/PathStatusStrip";
import { WorkspaceShell } from "../../components/WorkspaceShell";
import {
  api,
  ApiError,
  downloadAuthenticated,
  fetchAuthenticatedBlob,
  formatApiError,
  viewAuthenticated,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { logoutPathFor } from "../../lib/navigation";
import { useToast } from "../../lib/toast";
import { AdminDashboard } from "./AdminDashboard";

const PASSWORD_HINT = PASSWORD_REQUIREMENTS;

function firstSchemaIssue(issues: { path: PropertyKey[]; message: string }[]): string {
  const i = issues[0];
  if (!i) return "Check the form and try again.";
  const path = i.path.filter((p) => typeof p === "string" || typeof p === "number").join(".");
  return path ? `${path}: ${i.message}` : i.message;
}

type AdminSection = {
  path: string;
  label: string;
  permission: Permission;
  description: string;
  icon: LucideIcon;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { path: "dashboard", label: "Dashboard", permission: "reports:read", description: "Ops funnel metrics", icon: LayoutDashboard },
  { path: "students", label: "Students", permission: "students:read", description: "Browse and manage students", icon: Users },
  { path: "proofs", label: "Proofs", permission: "proofs:approve", description: "Approve completion uploads", icon: BadgeCheck },
  { path: "leads", label: "Leads", permission: "leads:read", description: "Accommodation enquiries", icon: Home },
  { path: "cards", label: "Cards", permission: "cards:edit", description: "Checklist cards & coming soon", icon: Layers },
  { path: "legal", label: "Legal", permission: "legal:publish", description: "Publish legal documents", icon: Scale },
  { path: "partners", label: "Partners", permission: "consultancies:manage", description: "Consultancies & codes", icon: Handshake },
  { path: "team", label: "Team", permission: "admins:manage", description: "Create admin logins", icon: UserCog },
  { path: "settings", label: "Settings", permission: "settings:links:edit", description: "Links, SIM & helper texts", icon: Settings },
  { path: "reports", label: "Reports", permission: "audit:read", description: "Audit log", icon: FileBarChart },
];

function AdminLayout() {
  const { user, ready, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const perms = user?.permissions ?? [];
  const visible = ADMIN_SECTIONS.filter((s) => hasPermission(perms, s.permission));

  if (!ready) return <p className="p-8 text-center text-sm text-charcoal-soft">Checking your session…</p>;
  if (!user || user.role !== "admin") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  async function onLogout() {
    const role = user?.role;
    await signOut();
    navigate(logoutPathFor(role), { replace: true });
  }

  return (
    <WorkspaceShell
      brandHref="/admin/dashboard"
      eyebrow="Admin"
      title="Admin"
      mobileNav
      nav={visible.map((s) => ({
        to: `/admin/${s.path}`,
        label: s.label,
        description: s.description,
        icon: s.icon,
      }))}
      user={user}
      onLogout={() => void onLogout()}
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
  cards?: Record<string, string>;
};

type TimelineEntry = {
  id?: string;
  at: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
};

const studentCol = createColumnHelper<StudentRow>();

function StatusPill({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-900"
        : "bg-mist text-charcoal-soft";
  return <span className={`status-pill capitalize ${cls}`}>{children}</span>;
}

function StudentsPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const perms = user?.permissions ?? [];
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [manageId, setManageId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealedIdentity | null>(null);
  const [revealName, setRevealName] = useState<string>();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineReady, setTimelineReady] = useState(false);
  const [cardKeys, setCardKeys] = useState<string[]>(["blocked_account", "sim", "accommodation"]);

  const manage = useMemo(
    () => (manageId ? students.find((s) => s.id === manageId) ?? null : null),
    [manageId, students],
  );

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ students: StudentRow[] }>("/v1/admin/students");
      setStudents(res.students);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load students.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasPermission(perms, "cards:edit")) return;
    void api
      .get<{ cards: { key: string }[] }>("/v1/admin/cards")
      .then((res) => {
        const keys = res.cards.map((c) => c.key);
        if (keys.length) setCardKeys(keys);
      })
      .catch(() => undefined);
  }, [perms]);

  useEffect(() => {
    if (!manageId || !hasPermission(perms, "audit:read")) {
      setTimeline([]);
      setTimelineReady(false);
      return;
    }
    setTimelineReady(false);
    void api
      .get<{ timeline: TimelineEntry[] }>(`/v1/admin/students/${manageId}/timeline`)
      .then((res) => setTimeline(res.timeline ?? []))
      .catch(() => setTimeline([]))
      .finally(() => setTimelineReady(true));
  }, [manageId, perms]);

  async function downloadStudentsCsv() {
    try {
      const blob = await fetchAuthenticatedBlob("/v1/admin/exports/students.csv");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "students.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : undefined);
    }
  }

  async function markPaid(id: string) {
    setBusyId(id);
    try {
      await api.post(`/v1/admin/students/${id}/mark-paid`, {
        reason: "Manual mark paid from admin students panel.",
      });
      toast.success("Marked as paid", "Payment status updated for this student.");
      await load();
    } catch (err) {
      toast.error("Mark paid failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  async function setCard(id: string, key: string, status: string) {
    setBusyId(id);
    try {
      await api.post(`/v1/admin/students/${id}/cards/${key}/status`, {
        status,
        reason: `Admin set ${key} to ${status} from students panel.`,
      });
      toast.success(
        "Card status updated",
        `${key.replaceAll("_", " ")} → ${status}. Shown in this table and on the student’s path.`,
      );
      await load();
    } catch (err) {
      toast.error("Card update failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  async function revealIdentity(student: StudentRow) {
    setBusyId(student.id);
    try {
      const res = await api.post<RevealedIdentity>(`/v1/admin/students/${student.id}/identity/reveal`, {
        reason: "Support review from admin students panel.",
      });
      setManageId(null);
      setRevealName(student.fullName);
      setReveal(res);
      toast.success("Identity revealed", "Details opened in a secure dialog. Access is audited.");
    } catch (err) {
      toast.error("Reveal failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  const canManage =
    hasPermission(perms, "students:mark_paid") ||
    hasPermission(perms, "identity:reveal") ||
    hasPermission(perms, "students:set_card_status");

  const columns = useMemo(
    () =>
      [
        studentCol.accessor("fullName", {
          header: "Student",
          cell: (info) => {
            const s = info.row.original;
            return (
              <div className="min-w-[10rem] max-w-[16rem]">
                <div className="table-primary truncate leading-snug">{s.fullName}</div>
                <div className="table-meta truncate leading-snug">
                  {s.email ?? s.id.slice(0, 8)}
                  {s.intake ? ` · ${s.intake}` : ""}
                </div>
              </div>
            );
          },
        }),
        studentCol.accessor("country", {
          header: "Country",
          cell: (info) => <span className="table-meta whitespace-nowrap">{info.getValue()}</span>,
        }),
        studentCol.accessor("paymentStatus", {
          header: "Pay",
          cell: (info) => (
            <StatusPill tone={info.getValue() === "paid" ? "ok" : "warn"}>{info.getValue()}</StatusPill>
          ),
        }),
        studentCol.accessor("identityComplete", {
          header: "ID",
          cell: (info) => (
            <StatusPill tone={info.getValue() ? "ok" : "muted"}>
              {info.getValue() ? "Done" : "Open"}
            </StatusPill>
          ),
        }),
        studentCol.display({
          id: "cards",
          header: "Path",
          enableSorting: false,
          cell: ({ row }) => <PathStatusStrip cards={row.original.cards} />,
        }),
        studentCol.display({
          id: "actions",
          header: "",
          enableSorting: false,
          size: 88,
          cell: ({ row }) =>
            canManage ? (
              <Button
                type="button"
                className="btn-secondary h-8 px-2.5 text-xs"
                onClick={() => setManageId(row.original.id)}
              >
                <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Manage
              </Button>
            ) : (
              <span className="text-xs text-charcoal-soft">—</span>
            ),
        }),
      ] as ColumnDef<StudentRow, unknown>[],
    [canManage],
  );

  const busy = manage ? busyId === manage.id : false;

  return (
    <Page title="Students" intro="Browse and manage student accounts." wide compact embedded>
      <DataTable
        data={students}
        columns={columns}
        loading={!ready}
        error={loadError}
        searchPlaceholder="Search name, email, country…"
        emptyTitle="No students yet"
        emptyDescription="When students register, they appear here for payment and identity review."
        emptyIcon={Users}
        getRowId={(row) => row.id}
        skeletonColumns={6}
        skeletonRows={8}
        density="compact"
        pageSize={25}
        pageSizeOptions={[25, 50, 100]}
        toolbar={
          hasPermission(perms, "exports:students") ? (
            <Button type="button" className="btn-secondary h-9 text-sm" onClick={() => void downloadStudentsCsv()}>
              <FileDown className="h-4 w-4 shrink-0" aria-hidden />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <Dialog
        open={manage !== null}
        title={manage?.fullName ?? "Student"}
        description={manage ? `${manage.email ?? manage.id} · ${manage.country} · ${manage.intake}` : undefined}
        onClose={() => setManageId(null)}
        footer={
          <Button type="button" className="btn-secondary" onClick={() => setManageId(null)}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
            Close
          </Button>
        }
      >
        {manage ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={manage.paymentStatus === "paid" ? "ok" : "warn"}>{manage.paymentStatus}</StatusPill>
              <StatusPill tone={manage.identityComplete ? "ok" : "muted"}>
                Identity {manage.identityComplete ? "complete" : "incomplete"}
              </StatusPill>
            </div>

            <div>
              <p className="section-label mb-2">Path status</p>
              <PathStatusStrip cards={manage.cards} />
            </div>

            <div className="flex flex-wrap gap-2">
              {hasPermission(perms, "students:mark_paid") && manage.paymentStatus !== "paid" && (
                <Button type="button" disabled={busy} onClick={() => void markPaid(manage.id)}>
                  <Banknote className="h-4 w-4 shrink-0" aria-hidden />
                  Mark paid
                </Button>
              )}
              {hasPermission(perms, "identity:reveal") && manage.identityComplete && (
                <Button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void revealIdentity(manage)}
                >
                  <ScanFace className="h-4 w-4 shrink-0" aria-hidden />
                  Reveal identity
                </Button>
              )}
            </div>

            {hasPermission(perms, "students:set_card_status") && (
              <div className="space-y-3 border-t border-charcoal/10 pt-4">
                <p className="section-label">Update path cards</p>
                {cardKeys.map((key) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block text-xs text-charcoal-soft capitalize">
                      {key.replaceAll("_", " ")}
                      {manage.cards?.[key] ? ` · current: ${manage.cards[key]!.replaceAll("_", " ")}` : ""}
                    </span>
                    <select
                      className="input"
                      value=""
                      disabled={busy}
                      onChange={(e) => {
                        const status = e.target.value;
                        if (status) void setCard(manage.id, key, status);
                      }}
                    >
                      <option value="">Set status…</option>
                      {CARD_STATUSES.filter((st) => st !== "coming_soon").map((st) => (
                        <option key={st} value={st}>
                          {st.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}

            {hasPermission(perms, "audit:read") && (
              <div className="space-y-2 border-t border-charcoal/10 pt-4">
                <p className="section-label">Timeline</p>
                {!timelineReady ? (
                  <p className="text-xs text-charcoal-soft">Loading…</p>
                ) : timeline.length === 0 ? (
                  <p className="text-xs text-charcoal-soft">No audit events for this student yet.</p>
                ) : (
                  <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                    {timeline.map((e) => (
                      <li key={e.id ?? `${e.at}-${e.action}`} className="rounded-md bg-mist/60 px-2 py-1.5">
                        <span className="table-primary">{e.action}</span>
                        <span className="text-charcoal-soft"> · {new Date(e.at).toLocaleString()}</span>
                        {e.actorId ? (
                          <span className="table-code block">
                            actor {e.actorId.slice(0, 8)}…
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Dialog>

      <IdentityRevealDialog
        open={reveal !== null}
        studentName={revealName}
        data={reveal}
        onClose={() => {
          setReveal(null);
          setRevealName(undefined);
        }}
      />
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
const leadCol = createColumnHelper<Lead>();

function leadStatusTone(status: string): "ok" | "warn" | "muted" {
  if (status === "booked") return "ok";
  if (status === "closed") return "muted";
  if (status === "new" || status === "contacted" || status === "viewing") return "warn";
  return "muted";
}

function LeadsPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const canUpdate = hasPermission(user?.permissions ?? [], "leads:update_status");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [manageId, setManageId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const manage = useMemo(
    () => (manageId ? leads.find((l) => l.id === manageId) ?? null : null),
    [manageId, leads],
  );

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ leads: Lead[] }>("/v1/accommodation/leads");
      setLeads(res.leads);
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load leads.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, status: string) {
    setBusy(true);
    try {
      await api.patch(`/v1/accommodation/leads/${id}`, { status });
      toast.success("Lead updated", `Status → ${status}`);
      await load();
    } catch (err) {
      toast.error("Update failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function addNote(id: string) {
    const body = noteDraft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.post(`/v1/accommodation/leads/${id}/notes`, { body });
      setNoteDraft("");
      toast.success("Note added");
      await load();
    } catch (err) {
      toast.error("Could not add note", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo(
    () =>
      [
        leadCol.accessor("city", {
          header: "City",
          cell: (info) => <span className="table-primary">{info.getValue()}</span>,
        }),
        leadCol.accessor("roomType", {
          header: "Room",
          cell: (info) => <span className="capitalize">{info.getValue()}</span>,
        }),
        leadCol.accessor("budget", {
          header: "Budget",
          cell: (info) => <span className="table-meta whitespace-nowrap">{info.getValue()}</span>,
        }),
        leadCol.accessor("phone", {
          header: "Phone",
          cell: (info) => (
            <a className="table-meta whitespace-nowrap text-orange-dark no-underline hover:underline" href={`tel:${info.getValue()}`}>
              {info.getValue()}
            </a>
          ),
        }),
        leadCol.accessor("status", {
          header: "Status",
          cell: (info) => (
            <StatusPill tone={leadStatusTone(info.getValue())}>{info.getValue()}</StatusPill>
          ),
        }),
        leadCol.accessor("createdAt", {
          header: "Received",
          cell: (info) => (
            <span className="table-meta whitespace-nowrap">
              {new Date(info.getValue()).toLocaleDateString()}
            </span>
          ),
        }),
        leadCol.accessor("notes", {
          header: "Notes",
          enableSorting: false,
          cell: (info) => {
            const n = info.getValue()?.trim();
            return n ? (
              <span className="table-meta line-clamp-2 max-w-[14rem]" title={n}>
                {n}
              </span>
            ) : (
              <span className="table-meta">—</span>
            );
          },
        }),
        leadCol.display({
          id: "actions",
          header: "",
          enableSorting: false,
          size: 88,
          cell: ({ row }) =>
            canUpdate ? (
              <Button
                type="button"
                className="btn-secondary h-8 px-2.5 text-xs"
                onClick={() => {
                  setManageId(row.original.id);
                  setNoteDraft("");
                }}
              >
                <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Manage
              </Button>
            ) : (
              <span className="text-xs text-charcoal-soft">View only</span>
            ),
        }),
      ] as ColumnDef<Lead, unknown>[],
    [canUpdate],
  );

  return (
    <Page title="Leads" intro="Housing enquiries from students — update status and follow up." wide compact embedded>
      <DataTable
        data={leads}
        columns={columns}
        loading={!ready}
        error={error}
        searchPlaceholder="Search city, phone, status…"
        emptyTitle="No leads yet"
        emptyDescription="When students submit a housing enquiry, they appear here for follow-up."
        emptyIcon={Home}
        getRowId={(row) => row.id}
        skeletonColumns={8}
        skeletonRows={6}
        density="compact"
        pageSize={25}
        pageSizeOptions={[25, 50, 100]}
        toolbar={
          <a className="btn-secondary h-9 text-sm no-underline" href={`${api.baseUrl}/v1/admin/exports/leads.csv`}>
            <FileDown className="h-4 w-4 shrink-0" aria-hidden />
            Export CSV
          </a>
        }
      />

      <Dialog
        open={manage !== null}
        title={manage ? `${manage.city} · ${manage.roomType}` : "Lead"}
        description={
          manage
            ? `Budget ${manage.budget} · ${manage.phone} · Student ${manage.userId.slice(0, 8)}…`
            : undefined
        }
        onClose={() => setManageId(null)}
        footer={
          <Button type="button" className="btn-secondary" onClick={() => setManageId(null)}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
            Close
          </Button>
        }
      >
        {manage ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={leadStatusTone(manage.status)}>{manage.status}</StatusPill>
              <a className="text-sm font-medium text-orange-dark no-underline hover:underline" href={`tel:${manage.phone}`}>
                Call {manage.phone}
              </a>
            </div>

            {manage.notes?.trim() ? (
              <div>
                <p className="section-label mb-1">Latest notes</p>
                <p className="whitespace-pre-wrap rounded-xl border border-charcoal/10 bg-mist/40 px-3 py-2.5 text-sm text-charcoal">
                  {manage.notes}
                </p>
              </div>
            ) : null}

            <label className="block text-sm">
              <span className="section-label mb-1 block">
                Status
              </span>
              <select
                className="input"
                value={manage.status}
                disabled={busy}
                onChange={(e) => void updateStatus(manage.id, e.target.value)}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2 border-t border-charcoal/10 pt-4">
              <p className="section-label">Add note</p>
              <textarea
                className="input min-h-24"
                placeholder="Call outcome, viewing time, next step…"
                value={noteDraft}
                disabled={busy}
                onChange={(e) => setNoteDraft(e.target.value)}
                maxLength={2000}
              />
              <Button
                type="button"
                disabled={busy || !noteDraft.trim()}
                onClick={() => void addNote(manage.id)}
              >
                <StickyNote className="h-4 w-4 shrink-0" aria-hidden />
                {busy ? "Saving…" : "Save note"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </Page>
  );
}

function SettingsPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const perms = user?.permissions ?? [];
  const [links, setLinks] = useState({
    expatrio: "https://www.expatrio.com/?p=nivoug",
    fintiba: "http://partner.fintiba.com/nivoug",
    vodafone: "",
  });
  const [simRules, setSimRules] = useState("blocked_account");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    void api
      .get<{
        links: Record<string, string>;
        simRules: string[];
        accommodationNotifyEmail?: string;
        texts?: Record<string, string>;
      }>("/v1/admin/settings")
      .then((res) => {
        setLinks({
          expatrio: res.links.expatrio ?? "https://www.expatrio.com/?p=nivoug",
          fintiba: res.links.fintiba ?? "http://partner.fintiba.com/nivoug",
          vodafone: res.links.vodafone ?? "",
        });
        setSimRules((res.simRules ?? []).join(", "));
        setNotifyEmail(res.accommodationNotifyEmail ?? "");
        setTexts(res.texts ?? {});
      })
      .catch((err) =>
        toast.error("Could not load settings", err instanceof ApiError ? err.message : undefined),
      );
  }, [toast]);

  async function saveLinks(e: FormEvent) {
    e.preventDefault();
    try {
      const cleaned = Object.fromEntries(
        Object.entries(links).filter(([, v]) => typeof v === "string" && v.trim().length > 0),
      );
      await api.put("/v1/admin/settings/links", { links: cleaned });
      toast.success("Partner links saved");
    } catch (err) {
      toast.error("Could not save links", err instanceof ApiError ? err.message : undefined);
    }
  }

  async function saveSim(e: FormEvent) {
    e.preventDefault();
    try {
      const requiredCardKeys = simRules
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.put("/v1/admin/settings/sim-rules", { requiredCardKeys });
      toast.success("SIM unlock rules saved");
    } catch (err) {
      toast.error("Could not save SIM rules", err instanceof ApiError ? err.message : undefined);
    }
  }

  async function saveNotify(e: FormEvent) {
    e.preventDefault();
    try {
      await api.put("/v1/admin/settings/accommodation-notify", { email: notifyEmail.trim() });
      toast.success("Accommodation notify email saved");
    } catch (err) {
      toast.error("Could not save notify email", err instanceof ApiError ? err.message : undefined);
    }
  }

  async function saveTexts(e: FormEvent) {
    e.preventDefault();
    try {
      await api.put("/v1/admin/settings/texts", { texts });
      toast.success("Helper texts saved");
    } catch (err) {
      toast.error("Could not save texts", err instanceof ApiError ? err.message : undefined);
    }
  }

  const textKeys = [
    "commission.disclosure",
    "card.sim.locked_helper",
    "card.jobs.notify_toast",
    "card.jobs.notify_exists",
    "cta.continue",
    "cta.notify_me",
  ];

  return (
    <Page title="Settings" intro="Partner links, SIM unlock rules, and student-facing helper texts." wide compact embedded>
      <div className="space-y-4">
        <form onSubmit={saveLinks}>
          <FormSection
            title="Partner links"
            description="Blocked account → Expatrio. Insurance → Fintiba. Used by student Continue actions."
          >
            <FieldGrid>
              {(
                [
                  ["expatrio", "Blocked account (Expatrio)"],
                  ["fintiba", "Insurance (Fintiba)"],
                  ["vodafone", "SIM (Vodafone)"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label} className="sm:col-span-2">
                  <input
                    className="input"
                    value={links[key]}
                    onChange={(e) => setLinks((l) => ({ ...l, [key]: e.target.value }))}
                    required={key !== "vodafone"}
                  />
                </Field>
              ))}
            </FieldGrid>
            <Button type="submit">
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              Save links
            </Button>
          </FormSection>
        </form>
        <form onSubmit={saveSim}>
          <FormSection title="SIM unlock" description="Cards that must be Completed before SIM unlocks.">
            <Field label="Required card keys" hint="Comma-separated. Default: blocked_account">
              <input className="input" value={simRules} onChange={(e) => setSimRules(e.target.value)} />
            </Field>
            <Button type="submit">
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              Save SIM rules
            </Button>
          </FormSection>
        </form>
        <form onSubmit={saveNotify}>
          <FormSection title="Accommodation notify" description="Email that receives new housing enquiries (e.g. Roshan).">
            <Field label="Notify email">
              <input
                className="input"
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                required
              />
            </Field>
            <Button type="submit">
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              Save notify email
            </Button>
          </FormSection>
        </form>
        {hasPermission(perms, "settings:texts:edit") && (
          <form onSubmit={saveTexts}>
            <FormSection
              title="Helper texts"
              description="Student-facing copy on the dashboard. Empty values fall back to built-in defaults after save only if you omit the key — keep defaults filled."
            >
              <FieldGrid>
                {textKeys.map((key) => (
                  <Field key={key} label={key} className="sm:col-span-2">
                    <textarea
                      className="input min-h-[4.5rem]"
                      value={texts[key] ?? ""}
                      onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
                    />
                  </Field>
                ))}
              </FieldGrid>
              <Button type="submit">
                <Save className="h-4 w-4 shrink-0" aria-hidden />
                Save texts
              </Button>
            </FormSection>
          </form>
        )}
      </div>
    </Page>
  );
}

type AdminRow = { id: string; email: string; fullName: string; totpEnabled: boolean };

function TeamPanel() {
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ admins: AdminRow[] }>("/v1/admin/admins");
      setAdmins(res.admins);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load admins.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openForm() {
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const parsed = createAdminSchema.safeParse({ email, fullName, password });
    if (!parsed.success) {
      toast.error("Check the form", firstSchemaIssue(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await api.post("/v1/admin/admins", parsed.data);
      toast.success("Admin created", parsed.data.email);
      setEmail("");
      setFullName("");
      setPassword("");
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error("Could not create admin", formatApiError(err, "Could not create admin"));
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<ActionColumn<AdminRow>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        cell: (a) => <span className="table-primary">{a.fullName}</span>,
      },
      {
        key: "email",
        header: "Email",
        cell: (a) => <span className="table-meta">{a.email}</span>,
      },
      {
        key: "2fa",
        header: "2FA",
        cell: (a) => (
          <StatusPill tone={a.totpEnabled ? "ok" : "muted"}>
            {a.totpEnabled ? "On" : "Off"}
          </StatusPill>
        ),
      },
    ],
    [],
  );

  const addAdminBtn = (
    <Button type="button" onClick={openForm}>
      <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
      Add admin
    </Button>
  );

  return (
    <Page title="Team" intro="Admin logins for /admin. First admin is bootstrapped on API startup." wide compact embedded>
      <FormSection title="Admins" description="People who can sign in at /admin/login.">
        <div className="mb-3 flex justify-end">{ready && admins.length > 0 ? addAdminBtn : null}</div>
        <ActionTable
          columns={columns}
          rows={admins}
          getRowId={(a) => a.id}
          loading={!ready}
          error={loadError}
          emptyTitle="No admins listed"
          emptyDescription="Create an admin login. The first super-admin may already be bootstrapped on API startup."
          emptyIcon={UserCog}
          emptyAction={addAdminBtn}
          actions={(a) => (
            <span className="text-xs text-charcoal-soft">
              {a.totpEnabled ? "Protected" : "Set 2FA in profile"}
            </span>
          )}
        />
      </FormSection>

      <Dialog
        open={formOpen}
        title="Add admin"
        description="They can sign in at /admin/login."
        onClose={closeForm}
        footer={
          <>
            <Button type="button" className="btn-secondary" disabled={busy} onClick={closeForm}>
              <X className="h-4 w-4 shrink-0" aria-hidden />
              Cancel
            </Button>
            <Button type="submit" form="team-admin-form" disabled={busy}>
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "Creating…" : "Create admin"}
            </Button>
          </>
        }
      >
        <form id="team-admin-form" onSubmit={onCreate} className="space-y-4">
          <FieldGrid>
            <Field label="Full name">
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Temporary password" hint={PASSWORD_HINT} className="sm:col-span-2">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </Field>
          </FieldGrid>
        </form>
      </Dialog>
    </Page>
  );
}

type PartnerRow = { id: string; name: string; code: string; link: string; hasManager: boolean };
const partnerCol = createColumnHelper<PartnerRow>();

function PartnersPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeAvoid, setCodeAvoid] = useState<string[]>([]);
  const [codeBusy, setCodeBusy] = useState(false);
  const [managerEmail, setManagerEmail] = useState("");
  const [managerName, setManagerName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [addForId, setAddForId] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [loadError, setLoadError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ consultancies: PartnerRow[] }>("/v1/admin/consultancies");
      setRows(res.consultancies);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load consultancies.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function absoluteLink(link: string) {
    return `${window.location.origin}${link.startsWith("/") ? link : `/${link}`}`;
  }

  async function copyJoinLink(link: string) {
    try {
      await navigator.clipboard.writeText(absoluteLink(link));
      toast.success("Join link copied");
    } catch {
      toast.error("Could not copy — select the link manually.");
    }
  }

  function resetCreateForm() {
    setName("");
    setCode("");
    setCodeAvoid([]);
    setManagerEmail("");
    setManagerName("");
  }

  function openCreate() {
    resetCreateForm();
    setCreateOpen(true);
  }

  function closeCreate() {
    if (busy || codeBusy) return;
    setCreateOpen(false);
  }

  function closeManager() {
    if (busy) return;
    setAddForId(null);
  }

  async function suggestCode(regenerate: boolean) {
    const orgName = name.trim();
    if (orgName.length < 2) {
      toast.error("Enter the organisation name first");
      return;
    }
    setCodeBusy(true);
    try {
      const avoid = regenerate && code ? [...new Set([...codeAvoid, code])] : codeAvoid;
      const res = await api.post<{ code: string }>("/v1/admin/consultancies/suggest-code", {
        name: orgName,
        ...(avoid.length ? { avoid } : {}),
      });
      setCode(res.code);
      setCodeAvoid(avoid);
    } catch (err) {
      toast.error(
        regenerate ? "Could not regenerate code" : "Could not generate code",
        formatApiError(err, "Try again in a moment."),
      );
    } finally {
      setCodeBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Generate a referral code first");
      return;
    }
    const draft: {
      name: string;
      code: string;
      managerEmail?: string;
      managerName?: string;
    } = { name, code };
    if (managerEmail.trim()) {
      draft.managerEmail = managerEmail.trim();
      if (managerName.trim()) draft.managerName = managerName.trim();
    }
    const parsed = createConsultancySchema.safeParse(draft);
    if (!parsed.success) {
      toast.error("Check the form", firstSchemaIssue(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      const created = await api.post<{ code: string; link: string; hasManager?: boolean }>(
        "/v1/admin/consultancies",
        parsed.data,
      );
      toast.success(
        `Created ${created.code}`,
        created.hasManager
          ? `Invite email sent to the manager. Student join link ${created.link}`
          : `Add a manager so they can join. Student join link ${created.link}`,
      );
      resetCreateForm();
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.error("Could not create consultancy", formatApiError(err, "Could not create consultancy"));
    } finally {
      setBusy(false);
    }
  }

  async function onAddManager(e: FormEvent) {
    e.preventDefault();
    if (!addForId) return;
    const parsed = addManagerSchema.safeParse({
      email: addEmail.trim(),
      ...(addName.trim() ? { fullName: addName.trim() } : {}),
    });
    if (!parsed.success) {
      toast.error("Check the form", firstSchemaIssue(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/v1/admin/consultancies/${addForId}/managers`, parsed.data);
      toast.success("Invite sent", "They will get an email to set a password and join the consultancy portal.");
      setAddForId(null);
      setAddEmail("");
      setAddName("");
      await load();
    } catch (err) {
      toast.error("Could not invite manager", formatApiError(err, "Could not invite manager"));
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo(
    () =>
      [
        partnerCol.accessor("name", {
          header: "Name",
          cell: (info) => <span className="table-primary">{info.getValue()}</span>,
        }),
        partnerCol.accessor("code", {
          header: "Code",
          cell: (info) => <span className="table-code">{info.getValue()}</span>,
        }),
        partnerCol.accessor("hasManager", {
          header: "Manager",
          cell: (info) =>
            info.getValue() ? (
              <span className="table-meta">Ready</span>
            ) : (
              <button
                type="button"
                className="text-xs font-medium text-orange-dark underline"
                onClick={() => {
                  setAddForId(info.row.original.id);
                  setAddEmail("");
                  setAddName("");
                }}
              >
                <UserPlus className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                Invite manager
              </button>
            ),
        }),
        partnerCol.accessor("link", {
          header: "Join link",
          enableSorting: false,
          cell: (info) => (
            <div className="flex flex-wrap items-center gap-2">
              <span className="table-code">{info.getValue()}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-dark underline"
                onClick={() => void copyJoinLink(info.getValue())}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </button>
            </div>
          ),
        }),
      ] as ColumnDef<PartnerRow, unknown>[],
    [],
  );

  const addConsultancyBtn = (
    <Button type="button" onClick={openCreate}>
      <Building2 className="h-4 w-4 shrink-0" aria-hidden />
      Add consultancy
    </Button>
  );

  return (
    <Page title="Partners" intro="Consultancies and referral codes students use at /r/CODE." compact wide embedded>
      <FormSection title="Consultancies">
        <div className="mb-3 flex justify-end">{ready && rows.length > 0 ? addConsultancyBtn : null}</div>
        <DataTable
          data={rows}
          columns={columns}
          loading={!ready}
          error={loadError}
          searchPlaceholder="Search consultancies…"
          emptyTitle="No consultancies yet"
          emptyDescription="Create one with a referral code students use at /r/CODE."
          emptyIcon={Handshake}
          emptyAction={addConsultancyBtn}
          getRowId={(row) => row.id}
          skeletonColumns={4}
          skeletonRows={4}
        />
      </FormSection>

      <Dialog
        open={createOpen}
        title="Add consultancy"
        description="Optionally invite a manager by email — they set their own password from the link."
        onClose={closeCreate}
        wide
        footer={
          <>
            <Button type="button" className="btn-secondary" disabled={busy} onClick={closeCreate}>
              <X className="h-4 w-4 shrink-0" aria-hidden />
              Cancel
            </Button>
            <Button type="submit" form="partner-create-form" disabled={busy || codeBusy || !code.trim()}>
              <Building2 className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "Creating…" : "Create consultancy"}
            </Button>
          </>
        }
      >
        <form id="partner-create-form" onSubmit={onCreate} className="space-y-4">
          <FieldGrid>
            <Field label="Organisation name" className="sm:col-span-2">
              <input
                className="input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  // Name drives the code — clear stale suggestion when they edit it.
                  if (code) {
                    setCode("");
                    setCodeAvoid([]);
                  }
                }}
                required
                minLength={2}
              />
            </Field>
            <Field
              label="Referral code"
              hint="Generated from the organisation name — unique letters and numbers"
              className="sm:col-span-2"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="input font-mono uppercase tracking-wide"
                  value={code}
                  readOnly
                  required
                  placeholder="Generate a code"
                  aria-required
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-sm"
                  disabled={busy || codeBusy || name.trim().length < 2}
                  onClick={() => void suggestCode(Boolean(code))}
                >
                  <RefreshCw className={`h-4 w-4 shrink-0 ${codeBusy ? "animate-spin" : ""}`} aria-hidden />
                  {codeBusy ? "Working…" : code ? "Regenerate" : "Generate code"}
                </button>
              </div>
            </Field>
            <Field label="Manager name (optional)">
              <input className="input" value={managerName} onChange={(e) => setManagerName(e.target.value)} />
            </Field>
            <Field label="Manager email (optional)" hint="Sends a join invite so they can set their own password">
              <input className="input" type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} />
            </Field>
          </FieldGrid>
        </form>
      </Dialog>

      <Dialog
        open={addForId !== null}
        title="Invite manager"
        description="Sends an email so they can set a password and join the consultancy portal."
        onClose={closeManager}
        footer={
          <>
            <Button type="button" className="btn-secondary" disabled={busy} onClick={closeManager}>
              <X className="h-4 w-4 shrink-0" aria-hidden />
              Cancel
            </Button>
            <Button type="submit" form="partner-manager-form" disabled={busy}>
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </>
        }
      >
        <form id="partner-manager-form" onSubmit={onAddManager} className="space-y-4">
          <FieldGrid>
            <Field label="Manager name">
              <input className="input" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </Field>
            <Field label="Manager email">
              <input className="input" type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} required />
            </Field>
          </FieldGrid>
        </form>
      </Dialog>
    </Page>
  );
}

type PendingProof = {
  id: string;
  userId: string;
  cardKey: string;
  status: string;
  fileId: string | null;
  createdAt: string;
  studentEmail: string | null;
  studentFullName: string | null;
};

function ProofsPanel() {
  const toast = useToast();
  const [proofs, setProofs] = useState<PendingProof[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ proofs: PendingProof[] }>("/v1/admin/proofs?status=pending");
      setProofs(res.proofs);
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load proofs.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    try {
      await api.post(`/v1/admin/proofs/${id}/decide`, { decision });
      toast.success(
        decision === "approved" ? "Proof approved" : "Proof rejected",
        decision === "approved" ? "Student card marked completed." : "Student can upload again.",
      );
      await load();
    } catch (err) {
      toast.error("Decision failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  async function openFile(id: string, download: boolean) {
    setBusyId(id);
    try {
      const path = `/v1/admin/proofs/${id}/file${download ? "?download=1" : ""}`;
      if (download) {
        await downloadAuthenticated(path, `proof-${id.slice(0, 8)}`);
        toast.success("Download started");
      } else {
        await viewAuthenticated(path);
      }
    } catch (err) {
      toast.error(
        download ? "Download failed" : "Could not open file",
        err instanceof ApiError ? err.message : undefined,
      );
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <Page
      title="Proofs"
      intro="Students upload completion proof on Blocked account and SIM cards. Open the file, then approve or reject."
      wide
      compact
      embedded
    >
      <AsyncContent
        ready={ready}
        error={error}
        empty={proofs.length === 0}
        emptyTitle="No pending proofs"
        emptyDescription="When a paid student uploads a completion proof from their dashboard, it appears here for review."
        emptyIcon={BadgeCheck}
        errorTitle="Couldn’t load proofs"
        skeleton="list"
        skeletonRows={3}
      >
        <div className="space-y-3">
          {proofs.map((p) => (
            <article key={p.id} className="surface space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="table-primary capitalize">{p.cardKey.replaceAll("_", " ")}</p>
                  <p className="mt-0.5 table-primary">
                    {p.studentFullName ?? "Unknown student"}
                    {p.studentEmail ? (
                      <span className="ml-2 font-normal text-charcoal-soft">{p.studentEmail}</span>
                    ) : null}
                  </p>
                  <p className="table-meta mt-1">
                    Uploaded {new Date(p.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId === p.id || !p.fileId}
                    onClick={() => void openFile(p.id, false)}
                  >
                    <Eye className="h-4 w-4 shrink-0" aria-hidden />
                    View
                  </Button>
                  <Button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId === p.id || !p.fileId}
                    onClick={() => void openFile(p.id, true)}
                  >
                    <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                    Download
                  </Button>
                  <Button type="button" disabled={busyId === p.id} onClick={() => void decide(p.id, "approved")}>
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId === p.id}
                    onClick={() => void decide(p.id, "rejected")}
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                    Reject
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </AsyncContent>
    </Page>
  );
}

type AuditRow = {
  id: string;
  at: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
};

const auditCol = createColumnHelper<AuditRow>();

function ReportsPanel() {
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .get<{ chain: { valid: boolean }; entries: AuditRow[] }>("/v1/admin/audit")
      .then((res) => {
        setEntries(res.entries);
        setChainValid(res.chain.valid);
        setError(undefined);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load audit."))
      .finally(() => setReady(true));
  }, []);

  const columns = useMemo(
    () =>
      [
        auditCol.accessor("at", {
          header: "When",
          cell: (info) => (
            <span className="table-meta whitespace-nowrap">{new Date(info.getValue()).toLocaleString()}</span>
          ),
        }),
        auditCol.accessor("action", {
          header: "Action",
          cell: (info) => <span className="table-primary">{info.getValue()}</span>,
        }),
        auditCol.accessor("actorId", {
          header: "Actor",
          cell: (info) => (
            <span className="table-code">{info.getValue()?.slice(0, 8) ?? "—"}</span>
          ),
        }),
        auditCol.display({
          id: "entity",
          header: "Entity",
          cell: ({ row }) => (
            <span className="table-meta">
              {row.original.entityType ?? "—"}
              {row.original.entityId ? ` · ${row.original.entityId.slice(0, 12)}` : ""}
            </span>
          ),
        }),
      ] as ColumnDef<AuditRow, unknown>[],
    [],
  );

  return (
    <Page title="Reports" intro="Recent audit events." wide compact embedded>
      <div className="mb-3 min-h-5 text-sm">
        {chainValid !== null ? (
          <>
            Audit chain:{" "}
            <span className={chainValid ? "text-green-800" : "text-red-700"}>
              {chainValid ? "valid" : "tampered"}
            </span>
          </>
        ) : (
          <span className="text-charcoal-soft">Checking audit chain…</span>
        )}
      </div>
      <DataTable
        data={entries}
        columns={columns}
        loading={!ready}
        error={error}
        searchPlaceholder="Search actions…"
        emptyTitle="No audit entries"
        emptyDescription="Admin and system events will show up here."
        emptyIcon={FileBarChart}
        getRowId={(row) => row.id}
        skeletonColumns={4}
      />
    </Page>
  );
}

type AdminCard = {
  key: string;
  title: string;
  description: string;
  position: number;
  comingSoon: boolean;
  published: boolean;
};

function CardsPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const perms = user?.permissions ?? [];
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [edit, setEdit] = useState<AdminCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    key: "",
    title: "",
    description: "",
    position: 5,
    comingSoon: true,
    published: true,
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ cards: AdminCard[] }>("/v1/admin/cards");
      setCards(res.cards);
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load cards.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    try {
      await api.put(`/v1/admin/cards/${edit.key}`, {
        title: edit.title,
        description: edit.description,
        position: edit.position,
        comingSoon: edit.comingSoon,
        published: edit.published,
      });
      toast.success("Card updated");
      setEdit(null);
      await load();
    } catch (err) {
      toast.error("Save failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function createCard(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/v1/admin/cards", draft);
      toast.success("Card created");
      setCreating(false);
      setDraft({ key: "", title: "", description: "", position: cards.length + 1, comingSoon: true, published: true });
      await load();
    } catch (err) {
      toast.error("Create failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Cards" intro="Checklist definitions, coming-soon toggles, and publish state." wide compact embedded>
      <div className="mb-3 flex justify-end">
        {hasPermission(perms, "cards:create") && (
          <Button type="button" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
            Add card
          </Button>
        )}
      </div>
      <AsyncContent ready={ready} error={error} empty={cards.length === 0} emptyTitle="No cards" skeleton="list">
        <ul className="space-y-2">
          {cards.map((c) => (
            <li key={c.key} className="surface flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="table-primary">
                  {c.title}{" "}
                  <span className="table-code">({c.key})</span>
                </p>
                <p className="table-meta line-clamp-2">{c.description}</p>
                <p className="table-meta mt-1">
                  pos {c.position} · {c.comingSoon ? "coming soon" : "live"} ·{" "}
                  {c.published ? "published" : "unpublished"}
                </p>
              </div>
              <Button type="button" className="btn-secondary h-9 text-sm" onClick={() => setEdit({ ...c })}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </AsyncContent>

      <Dialog open={edit !== null} title={edit ? `Edit ${edit.key}` : "Edit"} onClose={() => setEdit(null)}>
        {edit ? (
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Title">
              <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
            </Field>
            <Field label="Description">
              <textarea
                className="input min-h-[5rem]"
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </Field>
            <Field label="Position">
              <input
                className="input"
                type="number"
                value={edit.position}
                onChange={(e) => setEdit({ ...edit, position: Number(e.target.value) || 0 })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={edit.comingSoon}
                onChange={(e) => setEdit({ ...edit, comingSoon: e.target.checked })}
              />
              Coming soon
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={edit.published}
                onChange={(e) => setEdit({ ...edit, published: e.target.checked })}
              />
              Published on student checklist
            </label>
            <Button type="submit" disabled={busy}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              Save
            </Button>
          </form>
        ) : null}
      </Dialog>

      <Dialog open={creating} title="Add card" onClose={() => setCreating(false)}>
        <form onSubmit={createCard} className="space-y-3">
          <Field label="Key" hint="Lowercase slug, e.g. insurance">
            <input
              className="input"
              value={draft.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value.trim().toLowerCase() })}
              required
              pattern="[a-z][a-z0-9_]{0,63}"
            />
          </Field>
          <Field label="Title">
            <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
          </Field>
          <Field label="Description">
            <textarea
              className="input min-h-[5rem]"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.comingSoon}
              onChange={(e) => setDraft({ ...draft, comingSoon: e.target.checked })}
            />
            Coming soon
          </label>
          <Button type="submit" disabled={busy}>
            Create
          </Button>
        </form>
      </Dialog>
    </Page>
  );
}

const LEGAL_ADMIN_SLUGS = [
  { slug: "terms", label: "Terms" },
  { slug: "privacy", label: "Privacy" },
  { slug: "cookies", label: "Cookies" },
  { slug: "refund", label: "Withdrawal / Refunds" },
  { slug: "impressum", label: "Impressum" },
  { slug: "our_role", label: "Our Role" },
] as const;

function LegalPanel() {
  const toast = useToast();
  const [slug, setSlug] = useState<(typeof LEGAL_ADMIN_SLUGS)[number]["slug"]>("terms");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [version, setVersion] = useState("");
  const [publishedAt, setPublishedAt] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (s: string) => {
      try {
        const doc = await api.get<{ title: string; body: string; version: string; publishedAt?: string }>(
          `/v1/legal/${s}`,
        );
        setTitle(doc.title);
        setBody(doc.body);
        setVersion(doc.version);
        setPublishedAt(doc.publishedAt);
      } catch (err) {
        setTitle("");
        setBody("");
        setVersion("");
        setPublishedAt(undefined);
        toast.error("Could not load document", err instanceof ApiError ? err.message : undefined);
      }
    },
    [toast],
  );

  useEffect(() => {
    void load(slug);
  }, [slug, load]);

  async function publish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const doc = await api.put<{ publishedAt?: string }>("/v1/admin/legal/publish", {
        slug,
        version,
        title,
        body,
      });
      setPublishedAt(doc.publishedAt);
      toast.success("Published", `${slug} · ${version}`);
    } catch (err) {
      toast.error("Publish failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Legal"
      intro="Publish provisional counsel drafts. Bump version when content changes so students re-accept Terms."
      wide
      compact
      embedded
    >
      <form onSubmit={publish} className="space-y-4">
        <Field label="Document">
          <select className="input" value={slug} onChange={(e) => setSlug(e.target.value as typeof slug)}>
            {LEGAL_ADMIN_SLUGS.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <FieldGrid>
          <Field label="Title">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Version" hint="Unique per slug, e.g. 2025-11-draft2">
            <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} required />
          </Field>
        </FieldGrid>
        <Field label="Body">
          <textarea className="input min-h-[18rem] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} required />
        </Field>
        {publishedAt ? (
          <p className="text-xs text-charcoal-soft">Last published: {new Date(publishedAt).toLocaleString()}</p>
        ) : null}
        <Button type="submit" disabled={busy}>
          <Save className="h-4 w-4 shrink-0" aria-hidden />
          Publish version
        </Button>
      </form>
    </Page>
  );
}

function AdminLoginPage() {
  const { user, ready } = useAuth();
  if (ready && user?.role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Login kind="admin" />;
}

export default function AdminRoutes() {
  const { user } = useAuth();
  const first = ADMIN_SECTIONS.find((s) => hasPermission(user?.permissions ?? [], s.permission));
  return (
    <Routes>
      <Route path="login" element={<AdminLoginPage />} />
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to={first ? first.path : "dashboard"} replace />} />
        <Route
          path="dashboard"
          element={
            <PermissionGate permission="reports:read">
              <AdminDashboard />
            </PermissionGate>
          }
        />
        <Route
          path="students"
          element={
            <PermissionGate permission="students:read">
              <StudentsPanel />
            </PermissionGate>
          }
        />
        <Route
          path="proofs"
          element={
            <PermissionGate permission="proofs:approve">
              <ProofsPanel />
            </PermissionGate>
          }
        />
        <Route
          path="cards"
          element={
            <PermissionGate permission="cards:edit">
              <CardsPanel />
            </PermissionGate>
          }
        />
        <Route
          path="legal"
          element={
            <PermissionGate permission="legal:publish">
              <LegalPanel />
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
          path="partners"
          element={
            <PermissionGate permission="consultancies:manage">
              <PartnersPanel />
            </PermissionGate>
          }
        />
        <Route
          path="team"
          element={
            <PermissionGate permission="admins:manage">
              <TeamPanel />
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
