import { Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
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
 * Students → app shell. Admin/consultancy → bare outlet (their own workspace shells).
 * Guests → marketing chrome.
 */
export function Layout() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center font-display text-sm text-charcoal-soft">
        Loading NIVO…
      </div>
    );
  }

  if (user?.role === "student") {
    return (
      <>
        <AppShell />
        <CookieBanner />
      </>
    );
  }

  // Staff portals render their own WorkspaceShell; avoid double header/footer.
  if (user?.role === "admin" || user?.role === "consultancy") {
    return (
      <>
        <Outlet />
        <CookieBanner />
      </>
    );
  }

  return <MarketingLayout />;
}
