import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Page } from "../components/Page";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

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

function ConsultancyDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .get<Dashboard>("/v1/consultancy/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load dashboard."));
  }, []);

  return (
    <Page title="Consultancy dashboard" intro="Students attributed to your organisation.">
      {error && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{error}</p>}
      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Registered", data.counts.registered],
                ["Verified", data.counts.verified],
                ["Paid", data.counts.paid],
                ["Identity", data.counts.identity],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="surface text-center">
                <p className="text-2xl font-bold text-orange-dark">{value}</p>
                <p className="text-xs text-charcoal-soft">{label}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-beige/50 text-xs uppercase text-charcoal-soft">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">Intake</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Contact</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.pseudoId} className="border-t border-charcoal/10">
                    <td className="px-3 py-3">
                      <div className="font-medium">{s.displayName}</div>
                      <div className="font-mono text-xs text-charcoal-soft">{s.pseudoId}</div>
                    </td>
                    <td className="px-3 py-3">{s.country}</td>
                    <td className="px-3 py-3">{s.intake}</td>
                    <td className="px-3 py-3 capitalize">{s.stage.replace("_", " ")}</td>
                    <td className="px-3 py-3 text-xs">
                      {s.email || s.phone ? (
                        <>
                          {s.email && <div>{s.email}</div>}
                          {s.phone && <div>{s.phone}</div>}
                        </>
                      ) : (
                        <span className="text-charcoal-soft">Hidden (no share consent)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.students.length === 0 && (
              <p className="p-4 text-sm text-charcoal-soft">No referred students yet.</p>
            )}
          </div>
        </>
      )}
      {!data && !error && <p className="text-sm text-charcoal-soft">Loading…</p>}
    </Page>
  );
}

export default function ConsultancyRoutes() {
  const { user, ready } = useAuth();
  if (!ready) return <p className="p-8 text-center text-sm">Checking your session…</p>;
  if (!user || (user.role !== "consultancy" && user.role !== "admin")) {
    return <Navigate to="/login" replace />;
  }
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<ConsultancyDashboard />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
