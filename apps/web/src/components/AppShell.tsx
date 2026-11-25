import { Outlet, useNavigate } from "react-router-dom";
import { FileText, Home, ListChecks, UserRound } from "lucide-react";
import { useAuth } from "../lib/auth";
import { logoutPathFor } from "../lib/navigation";
import { WorkspaceShell } from "./WorkspaceShell";

const NAV = [
  { to: "/dashboard", label: "Your path", end: true, description: "Checklist & next step", icon: ListChecks },
  { to: "/accommodation", label: "Housing", description: "City, budget, leads", icon: Home },
  { to: "/documents", label: "Document store", description: "Uploads & invoices", icon: FileText },
  { to: "/profile", label: "You", description: "Security & privacy", icon: UserRound },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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
      user={user}
      onLogout={() => void onLogout()}
    >
      <Outlet />
    </WorkspaceShell>
  );
}
