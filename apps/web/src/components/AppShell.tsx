import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { logoutPathFor } from "../lib/navigation";
import { WorkspaceShell } from "./WorkspaceShell";

const NAV = [
  { to: "/dashboard", label: "Your path", end: true, description: "Checklist & next step" },
  { to: "/accommodation", label: "Housing", description: "City, budget, leads" },
  { to: "/documents", label: "Papers", description: "Invoices & uploads" },
  { to: "/profile", label: "You", description: "Security & privacy" },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.fullName?.split(/\s+/)[0];

  async function onLogout() {
    const role = user?.role;
    await signOut();
    navigate(logoutPathFor(role), { replace: true });
  }

  return (
    <WorkspaceShell
      brandHref="/dashboard"
      eyebrow="Student"
      title="Student"
      nav={NAV}
      mobileNav
      userSlot={
        <div className="flex items-center gap-2.5 md:block md:space-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-9 w-9 shrink-0 rounded-full border border-charcoal/10 object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange/15 text-sm font-semibold text-orange-dark"
              >
                {(user?.fullName ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-medium text-charcoal">{firstName ?? "Student"}</p>
              <p className="truncate text-xs text-charcoal-soft">{user?.email}</p>
            </div>
          </div>
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
      <Outlet />
    </WorkspaceShell>
  );
}
