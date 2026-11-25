import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BadgeCheck,
  FileBarChart,
  Handshake,
  Home,
  Layers,
  Scale,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { hasPermission, type Permission } from "@nivo/shared";
import { AsyncContent } from "../../components/AsyncContent";
import { Page } from "../../components/Page";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const ORANGE = "#FB770B";
const ORANGE_DARK = "#C45508";
const CHARCOAL = "#1C1A17";
const CHARCOAL_SOFT = "#5E584F";
const MIST = "#E8E4DC";
const PAPER = "#F3F1EC";

const QUICK_NAV: { path: string; label: string; permission: Permission; icon: LucideIcon }[] = [
  { path: "cards", label: "Cards", permission: "cards:edit", icon: Layers },
  { path: "partners", label: "Partners", permission: "consultancies:manage", icon: Handshake },
  { path: "team", label: "Team", permission: "admins:manage", icon: UserCog },
  { path: "settings", label: "Settings", permission: "settings:links:edit", icon: Settings },
  { path: "legal", label: "Legal", permission: "legal:publish", icon: Scale },
  { path: "reports", label: "Reports", permission: "audit:read", icon: FileBarChart },
];

export type FunnelStats = {
  registrations: number;
  paid: number;
  unpaid: number;
  completions: Record<string, number>;
  simUnlocked: number;
  accommodationLeads: number;
  pendingProofs: number;
  generatedAt: string;
};

type KpiTile = {
  label: string;
  value: number;
  to: string;
  permission: Permission;
  hint: string;
};

type QueueCard = {
  label: string;
  count: number;
  to: string;
  permission: Permission;
  icon: LucideIcon;
  empty: string;
  cta: string;
};

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const perms = user?.permissions ?? [];
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .get<FunnelStats>("/v1/admin/reports/funnel")
      .then((res) => {
        setStats(res);
        setError(undefined);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load funnel."))
      .finally(() => setReady(true));
  }, []);

  const tiles: KpiTile[] = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: "Registrations",
        value: stats.registrations,
        to: "/admin/students",
        permission: "students:read",
        hint: "Open students",
      },
      {
        label: "Paid",
        value: stats.paid,
        to: "/admin/students",
        permission: "students:read",
        hint: "Open students",
      },
      {
        label: "Unpaid",
        value: stats.unpaid,
        to: "/admin/students",
        permission: "students:read",
        hint: "Open students",
      },
      {
        label: "SIM unlocked",
        value: stats.simUnlocked,
        to: "/admin/students",
        permission: "students:read",
        hint: "Open students",
      },
      {
        label: "Housing leads",
        value: stats.accommodationLeads,
        to: "/admin/leads",
        permission: "leads:read",
        hint: "Open leads",
      },
    ];
  }, [stats]);

  const paymentData = useMemo(() => {
    if (!stats) return [];
    const rows = [
      { name: "Paid", value: stats.paid, fill: ORANGE },
      { name: "Unpaid", value: stats.unpaid, fill: MIST },
    ];
    return rows.filter((r) => r.value > 0).length > 0
      ? rows
      : [{ name: "No students", value: 1, fill: MIST }];
  }, [stats]);

  const completionData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.completions)
      .map(([key, count]) => ({
        key,
        label: key.replaceAll("_", " "),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const queues: QueueCard[] = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: "Pending proofs",
        count: stats.pendingProofs,
        to: "/admin/proofs",
        permission: "proofs:approve",
        icon: BadgeCheck,
        empty: "No completion uploads waiting.",
        cta: "Review proofs",
      },
    ];
  }, [stats]);

  const quickNav = useMemo(
    () => QUICK_NAV.filter((s) => hasPermission(perms, s.permission)),
    [perms],
  );

  const canCards = hasPermission(perms, "cards:edit");

  return (
    <Page
      title="Dashboard"
      intro="Ops funnel, queues, and shortcuts into the sections you use most."
      wide
      compact
      embedded
    >
      <AsyncContent ready={ready} error={error} empty={!stats} emptyTitle="No metrics" skeleton="list" skeletonRows={3}>
        {stats ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {tiles.map((t) => {
                const allowed = hasPermission(perms, t.permission);
                const className =
                  "surface group block rounded-xl p-4 text-left transition hover:border-orange/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange";
                const body = (
                  <>
                    <p className="section-label">{t.label}</p>
                    <p className="mt-2 font-display text-3xl text-charcoal tabular-nums">{t.value}</p>
                    {allowed ? (
                      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-orange-dark opacity-80 group-hover:opacity-100">
                        {t.hint}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </p>
                    ) : null}
                  </>
                );
                return allowed ? (
                  <Link key={t.label} to={t.to} className={className}>
                    {body}
                  </Link>
                ) : (
                  <div key={t.label} className="surface rounded-xl p-4">
                    {body}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="surface rounded-xl p-4 sm:p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-charcoal">Payment split</h2>
                    <p className="mt-0.5 text-xs text-charcoal-soft">Paid vs unpaid registrations</p>
                  </div>
                  {hasPermission(perms, "students:read") ? (
                    <Link to="/admin/students" className="inline-flex items-center gap-1 text-xs font-medium text-orange-dark no-underline hover:underline">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      Students
                    </Link>
                  ) : null}
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke={PAPER}
                        strokeWidth={2}
                      >
                        {paymentData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid rgba(28,26,23,0.1)",
                          background: "#fff",
                          color: CHARCOAL,
                          fontSize: 12,
                        }}
                        formatter={(value) => [value ?? 0, ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-charcoal-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-orange" aria-hidden />
                    Paid · {stats.paid}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-mist" aria-hidden />
                    Unpaid · {stats.unpaid}
                  </span>
                </div>
              </section>

              <section className="surface rounded-xl p-4 sm:p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-charcoal">Completions by card</h2>
                    <p className="mt-0.5 text-xs text-charcoal-soft">
                      {canCards ? "Click a bar to open Cards" : "Checklist progress across students"}
                    </p>
                  </div>
                  {canCards ? (
                    <Link to="/admin/cards" className="inline-flex items-center gap-1 text-xs font-medium text-orange-dark no-underline hover:underline">
                      <Layers className="h-3.5 w-3.5" aria-hidden />
                      Cards
                    </Link>
                  ) : null}
                </div>
                {completionData.length === 0 ? (
                  <p className="py-16 text-center text-sm text-charcoal-soft">No card completions yet.</p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={completionData}
                        layout="vertical"
                        margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                      >
                        <XAxis type="number" allowDecimals={false} tick={{ fill: CHARCOAL_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={88}
                          tick={{ fill: CHARCOAL_SOFT, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(251,119,11,0.06)" }}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid rgba(28,26,23,0.1)",
                            background: "#fff",
                            color: CHARCOAL,
                            fontSize: 12,
                          }}
                          formatter={(value) => [value ?? 0, "Completions"]}
                          labelFormatter={(label) => String(label)}
                        />
                        <Bar
                          dataKey="count"
                          fill={ORANGE_DARK}
                          radius={[0, 6, 6, 0]}
                          maxBarSize={18}
                          cursor={canCards ? "pointer" : "default"}
                          onClick={() => {
                            if (canCards) navigate("/admin/cards");
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {queues
                .filter((q) => hasPermission(perms, q.permission))
                .map((q) => {
                  const Icon = q.icon;
                  return (
                    <Link
                      key={q.to}
                      to={q.to}
                      className="surface group flex items-start gap-3 rounded-xl p-4 transition hover:border-orange/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-charcoal/10 bg-[#FAF8F5] text-orange-dark">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-charcoal">{q.label}</span>
                          <span className="font-display text-2xl tabular-nums text-charcoal">{q.count}</span>
                        </span>
                        <span className="mt-1 block text-xs text-charcoal-soft">
                          {q.count === 0 ? q.empty : `${q.count} waiting for review`}
                        </span>
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-orange-dark">
                          {q.cta}
                          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              {hasPermission(perms, "leads:read") ? (
                <Link
                  to="/admin/leads"
                  className="surface group flex items-start gap-3 rounded-xl p-4 transition hover:border-orange/40"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-charcoal/10 bg-[#FAF8F5] text-orange-dark">
                    <Home className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-charcoal">Housing leads</span>
                      <span className="font-display text-2xl tabular-nums text-charcoal">{stats.accommodationLeads}</span>
                    </span>
                    <span className="mt-1 block text-xs text-charcoal-soft">
                      {stats.accommodationLeads === 0 ? "No enquiries yet." : "Open the leads inbox"}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-orange-dark">
                      Open leads
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </span>
                </Link>
              ) : null}
            </div>

            {quickNav.length > 0 ? (
              <section>
                <h2 className="section-label mb-2">Jump to</h2>
                <div className="flex flex-wrap gap-2">
                  {quickNav.map((s) => {
                    const Icon = s.icon;
                    return (
                      <Link
                        key={s.path}
                        to={`/admin/${s.path}`}
                        className="inline-flex min-h-tap items-center gap-2 rounded-lg border border-charcoal/10 bg-white px-3 py-2 text-sm text-charcoal no-underline transition hover:border-orange/40 hover:text-orange-dark"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-orange-dark" aria-hidden />
                        {s.label}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <p className="text-xs text-charcoal-soft">Updated {new Date(stats.generatedAt).toLocaleString()}</p>
          </div>
        ) : null}
      </AsyncContent>
    </Page>
  );
}
