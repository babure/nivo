import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Page } from "../components/Page";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { logoutPathFor } from "../lib/navigation";

type Dashboard = {
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
      nav={[
        {
          to: "/consultancy/dashboard",
          label: "Referrals",
          end: true,
          description: "Students attributed to you",
        },
      ]}
      userSlot={
        <div className="space-y-2">
          <p className="truncate px-1 text-xs text-charcoal-soft">{user?.email}</p>
          <button
            type="button"
            className="text-sm font-medium text-charcoal-soft underline-offset-4 hover:text-charcoal hover:underline"
            onClick={() => void onLogout()}
          >
            Log out
          </button>
        </div>
      }
    >
      {children}
    </WorkspaceShell>
  );
}

function ConsultancyDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .get<Dashboard>("/v1/consultancy/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load referrals."));
  }, []);

  return (
    <ConsultancyLayout>
      <Page
        title="Referrals"
        intro="Students attributed to your organisation. Contact details only show when the student consented."
        wide
        compact
        actions={
          <button
            type="button"
            className="btn-secondary text-sm"
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
                } catch {
                  setError("Could not download CSV.");
                }
              })();
            }}
          >
            Download CSV
          </button>
        }
      >
        {error && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{error}</p>}
        {data && (
          <>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-charcoal/10 text-xs text-charcoal-soft">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Country</th>
                    <th className="px-4 py-3 font-medium">Intake</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.pseudoId} className="border-t border-charcoal/8">
                      <td className="px-4 py-3">
                        <div className="font-medium text-charcoal">{s.displayName}</div>
                        <div className="font-mono text-xs text-charcoal-soft">{s.pseudoId}</div>
                      </td>
                      <td className="px-4 py-3 text-charcoal-soft">{s.country}</td>
                      <td className="px-4 py-3 text-charcoal-soft">{s.intake}</td>
                      <td className="px-4 py-3 capitalize text-charcoal">{s.stage.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-xs text-charcoal-soft">
                        {s.email || s.phone ? (
                          <>
                            {s.email && <div>{s.email}</div>}
                            {s.phone && <div>{s.phone}</div>}
                          </>
                        ) : (
                          "Hidden"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.students.length === 0 && (
                <p className="p-6 text-sm text-charcoal-soft">No referred students yet. Share your referral link to get started.</p>
              )}
            </div>
          </>
        )}
        {!data && !error && <p className="text-sm text-charcoal-soft">Loading…</p>}
      </Page>
    </ConsultancyLayout>
  );
}

export default function ConsultancyRoutes() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="p-8 text-center text-sm text-charcoal-soft">Checking your session…</p>;
  if (!user || (user.role !== "consultancy" && user.role !== "admin")) {
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
