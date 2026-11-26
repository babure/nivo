import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { inviteStudentSchema } from "@nivo/shared";
import { Check, Copy, FileDown, MailPlus, Users } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/DataTable";
import { Field, FieldGrid, Page } from "../components/Page";
import { Skeleton, StatGridSkeleton } from "../components/Skeleton";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { api, ApiError, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { logoutPathFor } from "../lib/navigation";
import { useToast } from "../lib/toast";

type Dashboard = {
  organisation: { id: string; name: string; code: string; link: string } | null;
  counts: { registered: number; verified: number; paid: number; identity: number };
  students: {
    pseudoId: string;
    displayName: string;
    country: string;
    intake: string;
    stage: string;
    email?: string;
    phone?: string;
  }[];
};

type ReferralRow = Dashboard["students"][number];
const referralCol = createColumnHelper<ReferralRow>();

function absoluteReferralUrl(link: string) {
  if (typeof window === "undefined") return link;
  return `${window.location.origin}${link.startsWith("/") ? link : `/${link}`}`;
}

function ConsultancyLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    const role = user?.role;
    await signOut();
    navigate(logoutPathFor(role), { replace: true });
  }

  return (
    <WorkspaceShell
      brandHref="/consultancy/dashboard"
      eyebrow="Consultancy"
      title="Consultancy"
      mobileNav
      nav={[
        {
          to: "/consultancy/dashboard",
          label: "Referrals",
          end: true,
          description: "Students attributed to you",
          icon: Users,
        },
      ]}
      user={user}
      onLogout={() => void onLogout()}
    >
      {children}
    </WorkspaceShell>
  );
}

function ConsultancyDashboard() {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [confirmInvite, setConfirmInvite] = useState(false);

  useEffect(() => {
    void api
      .get<Dashboard>("/v1/consultancy/dashboard")
      .then((res) => {
        setData(res);
        setError(undefined);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load referrals."))
      .finally(() => setReady(true));
  }, []);

  async function copyLink() {
    if (!data?.organisation?.link) return;
    try {
      await navigator.clipboard.writeText(absoluteReferralUrl(data.organisation.link));
      setCopied(true);
      toast.success("Join link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link — select and copy it manually.");
    }
  }

  function onInviteStudent(e: FormEvent) {
    e.preventDefault();
    const draft: { email: string; fullName?: string } = { email: inviteEmail.trim() };
    if (inviteName.trim()) draft.fullName = inviteName.trim();
    const parsed = inviteStudentSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error("Check the form", parsed.error.issues[0]?.message ?? "Enter a valid email.");
      return;
    }
    setConfirmInvite(true);
  }

  async function doInviteStudent() {
    const draft: { email: string; fullName?: string } = { email: inviteEmail.trim() };
    if (inviteName.trim()) draft.fullName = inviteName.trim();
    const parsed = inviteStudentSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error("Check the form", parsed.error.issues[0]?.message ?? "Enter a valid email.");
      return;
    }
    setInviteBusy(true);
    try {
      const res = await api.post<{ email: string; link: string }>(
        "/v1/consultancy/invite-student",
        parsed.data,
      );
      toast.success(
        "Invite sent",
        `${res.email} got your referral link (${res.link}). They register themselves from that email.`,
      );
      setConfirmInvite(false);
      setInviteEmail("");
      setInviteName("");
    } catch (err) {
      toast.error("Could not send invite", formatApiError(err, "Could not send invite"));
    } finally {
      setInviteBusy(false);
    }
  }

  const columns = useMemo(
    () =>
      [
        referralCol.accessor("displayName", {
          header: "Student",
          cell: (info) => (
            <div>
              <div className="table-primary">{info.getValue()}</div>
              <div className="table-code">{info.row.original.pseudoId}</div>
            </div>
          ),
        }),
        referralCol.accessor("country", { header: "Country" }),
        referralCol.accessor("intake", { header: "Intake" }),
        referralCol.accessor("stage", {
          header: "Stage",
          cell: (info) => <span className="capitalize">{info.getValue().replaceAll("_", " ")}</span>,
        }),
        referralCol.display({
          id: "contact",
          header: "Contact",
          enableSorting: false,
          cell: ({ row }) => {
            const s = row.original;
            if (!s.email && !s.phone) return <span className="table-meta">Hidden</span>;
            return (
              <div className="table-meta">
                {s.email && <div>{s.email}</div>}
                {s.phone && <div>{s.phone}</div>}
              </div>
            );
          },
        }),
      ] as ColumnDef<ReferralRow, unknown>[],
    [],
  );

  return (
    <ConsultancyLayout>
      <Page
        title="Referrals"
        intro="Students attributed to your organisation. Contact details only show when the student consented."
        wide
        compact
        embedded
        actions={
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={!ready || Boolean(error)}
            onClick={() => {
              void (async () => {
                try {
                  const res = await fetch(`${api.baseUrl}/v1/consultancy/export.csv`, {
                    credentials: "include",
                  });
                  if (!res.ok) throw new Error("export failed");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "consultancy-students.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("CSV downloaded");
                } catch {
                  toast.error("Could not download CSV.");
                }
              })();
            }}
          >
            <FileDown className="h-4 w-4 shrink-0" aria-hidden />
            Download CSV
          </button>
        }
      >
        <div className="space-y-6">
          <div className="rounded-2xl border border-charcoal/10 bg-white px-4 py-4 sm:px-5">
            {!ready ? (
              <div className="space-y-3" role="status" aria-label="Loading organisation">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ) : data?.organisation ? (
              <>
                <p className="section-label">Your organisation</p>
                <p className="mt-1 font-display text-xl font-semibold text-charcoal">{data.organisation.name}</p>
                <p className="mt-3 text-sm text-charcoal-soft">
                  Referral code{" "}
                  <span className="table-code font-medium text-charcoal">{data.organisation.code}</span>
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="block flex-1 truncate rounded-xl bg-charcoal/[0.04] px-3 py-2 text-xs text-charcoal">
                    {absoluteReferralUrl(data.organisation.link)}
                  </code>
                  <button type="button" className="btn-secondary shrink-0 text-sm" onClick={() => void copyLink()}>
                    {copied ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {copied ? "Copied" : "Copy join link"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-charcoal-soft">
                  Share this link with students. They register at NIVO and appear here once attributed.
                </p>
              </>
            ) : (
              <p className="text-sm text-charcoal-soft">Organisation details unavailable.</p>
            )}
          </div>

          {data?.organisation ? (
            <form
              onSubmit={(e) => void onInviteStudent(e)}
              className="rounded-2xl border border-charcoal/10 bg-white px-4 py-4 sm:px-5"
            >
              <p className="section-label">Invite a student</p>
              <p className="mt-1 text-sm text-charcoal-soft">
                Email them your referral link so they can register under code{" "}
                <span className="table-code font-medium text-charcoal">{data.organisation.code}</span>.
              </p>
              <div className="mt-4">
                <FieldGrid>
                  <Field label="Student name (optional)">
                    <input
                      className="input"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      disabled={inviteBusy}
                    />
                  </Field>
                  <Field label="Student email">
                    <input
                      className="input"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      disabled={inviteBusy}
                    />
                  </Field>
                </FieldGrid>
              </div>
              <button type="submit" className="btn-primary mt-4 text-sm" disabled={inviteBusy || !inviteEmail.trim()}>
                <MailPlus className="h-4 w-4 shrink-0" aria-hidden />
                {inviteBusy ? "Sending…" : "Send referral invite"}
              </button>
            </form>
          ) : null}

          {!ready ? (
            <StatGridSkeleton />
          ) : data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Registered", data.counts.registered],
                  ["Verified", data.counts.verified],
                  ["Paid", data.counts.paid],
                  ["Identity", data.counts.identity],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-charcoal/10 bg-white px-4 py-4">
                  <p className="font-display text-2xl font-semibold text-charcoal">{value}</p>
                  <p className="mt-1 text-xs text-charcoal-soft">{label}</p>
                </div>
              ))}
            </div>
          ) : null}

          <DataTable
            data={data?.students ?? []}
            columns={columns}
            loading={!ready}
            error={error}
            searchPlaceholder="Search referred students…"
            emptyTitle="No referred students yet"
            emptyDescription="Copy your join link above and share it — students who register with that code appear here."
            emptyIcon={Users}
            getRowId={(row) => row.pseudoId}
            skeletonColumns={5}
          />
        </div>
      </Page>

      <ConfirmDialog
        open={confirmInvite}
        title="Send referral invite?"
        description={`An email with your join link goes to ${inviteEmail.trim()}${
          inviteName.trim() ? ` (${inviteName.trim()})` : ""
        }.`}
        confirmLabel="Send invite"
        busy={inviteBusy}
        onClose={() => setConfirmInvite(false)}
        onConfirm={() => doInviteStudent()}
      />
    </ConsultancyLayout>
  );
}

export default function ConsultancyRoutes() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="p-8 text-center text-sm text-charcoal-soft">Checking your session…</p>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user.role === "admin") {
    return <Navigate to="/admin/partners" replace />;
  }
  if (user.role !== "consultancy") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<ConsultancyDashboard />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
