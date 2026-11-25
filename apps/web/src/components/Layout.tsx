import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  homePathFor,
  isAdminAppPath,
  isConsultancyAppPath,
  isStudentAppPath,
} from "../lib/navigation";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CookieBanner } from "./CookieBanner";
import { AppShell } from "./AppShell";

/** Marketing chrome for guests and public pages. */
function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col px-0">
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}

/**
 * Pick chrome by route + role.
 * Students only get AppShell on student app routes (not home/login/legal).
 * Staff only get bare outlet on their portals; elsewhere use marketing chrome.
 * Wrong-area URLs bounce to that role's home.
 */
export function Layout() {
  const { user, ready } = useAuth();
  const { pathname } = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center font-display text-sm text-charcoal-soft">
        Loading NIVO…
      </div>
    );
  }

  const studentArea = isStudentAppPath(pathname);
  const adminArea = isAdminAppPath(pathname);
  const consArea = isConsultancyAppPath(pathname);
  const adminLogin = pathname === "/admin/login" || pathname.startsWith("/admin/login/");

  if (user?.role === "admin" && studentArea) {
    return <Navigate to={homePathFor(user)} replace />;
  }
  if (user?.role === "consultancy" && studentArea) {
    return <Navigate to={homePathFor(user)} replace />;
  }
  if (user?.role === "student" && (adminArea || consArea) && !adminLogin) {
    return <Navigate to={homePathFor(user)} replace />;
  }
  if (user?.role === "admin" && consArea) {
    // Admins may open consultancy dashboard; allow.
  } else if (user?.role === "consultancy" && adminArea && !adminLogin) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  if (user?.role === "student" && studentArea) {
    return (
      <>
        <AppShell />
        <CookieBanner />
      </>
    );
  }

  if (user?.role === "admin" && adminArea && !adminLogin) {
    return (
      <>
        <Outlet />
        <CookieBanner />
      </>
    );
  }

  if (user?.role === "consultancy" && consArea) {
    return (
      <>
        <Outlet />
        <CookieBanner />
      </>
    );
  }

  if (user?.role === "admin" && consArea) {
    return (
      <>
        <Outlet />
        <CookieBanner />
      </>
    );
  }

  return <MarketingLayout />;
}
