/** Shared post-login / logout destinations so roles never land in the wrong shell. */

export type AppRole = "student" | "admin" | "consultancy" | null;

export type NavUser = {
  role: AppRole;
  paymentStatus: string;
  identityComplete: boolean;
};

/** Canonical home after login (or when bouncing off a wrong-area URL). */
export function homePathFor(user: NavUser): string {
  if (user.role === "admin") return "/admin/students";
  if (user.role === "consultancy") return "/consultancy/dashboard";
  if (user.paymentStatus !== "paid") return "/pay";
  if (!user.identityComplete) return "/onboarding/identity";
  return "/dashboard";
}

/** Where to send the browser after logout. */
export function logoutPathFor(role: AppRole | undefined | null): string {
  if (role === "admin") return "/admin/login";
  if (role === "consultancy") return "/login";
  return "/";
}

export function isStudentAppPath(pathname: string): boolean {
  return (
    pathname === "/pay" ||
    pathname === "/dashboard" ||
    pathname === "/accommodation" ||
    pathname === "/documents" ||
    pathname === "/profile" ||
    pathname.startsWith("/onboarding/")
  );
}

export function isAdminAppPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isConsultancyAppPath(pathname: string): boolean {
  return pathname === "/consultancy" || pathname.startsWith("/consultancy/");
}

/** Only honor `location.state.from` when it belongs to this role's area. */
export function isSafeReturnPath(path: string | undefined | null, role: AppRole): boolean {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("://")) return false;
  if (role === "admin") return isAdminAppPath(path) && !path.startsWith("/admin/login");
  if (role === "consultancy") return isConsultancyAppPath(path);
  if (isAdminAppPath(path) || isConsultancyAppPath(path)) return false;
  return true;
}

export function resolvePostLoginPath(user: NavUser, from?: string | null): string {
  if (from && isSafeReturnPath(from, user.role)) return from;
  return homePathFor(user);
}
