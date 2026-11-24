import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasPermission, type Permission } from "@nivo/shared";
import { useAuth } from "../lib/auth";

/** Requires a signed-in session cookie (any role). */
export function RequireAuth({ redirectTo = "/login" }: { redirectTo?: string }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-charcoal-soft">
        Checking your session…
      </div>
    );
  }
  if (!user) return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Shows children only when the admin holds the given permission. */
export function PermissionGate({
  permission,
  children,
  fallback,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !hasPermission(user.permissions, permission)) {
    return <>{fallback ?? <ForbiddenNotice permission={permission} />}</>;
  }
  return <>{children}</>;
}

export function ForbiddenNotice({ permission }: { permission?: Permission }) {
  return (
    <div role="alert" className="surface">
      <h2 className="text-lg font-semibold">Access restricted</h2>
      <p className="mt-1 text-sm text-charcoal-soft">
        You don’t have permission to view this section{permission ? ` (${permission})` : ""}.
      </p>
    </div>
  );
}
