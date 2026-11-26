import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { homePathFor, logoutPathFor } from "../lib/navigation";

const PUBLIC_NAV = [
  { hash: "#path", label: "The path" },
  { hash: "#how-it-works", label: "How it works" },
  { hash: "#fee", label: "The fee" },
  { hash: "#faq", label: "FAQ" },
  { hash: "#about", label: "Contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-tap w-full items-center rounded-xl px-3 text-sm font-medium no-underline sm:w-auto ${
      isActive ? "text-orange-dark" : "text-charcoal hover:text-orange-dark"
    }`;

  const isAdmin = user?.role === "admin";
  const isConsultancy = user?.role === "consultancy";

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function goSection(hash: string) {
    setOpen(false);
    if (location.pathname === "/") {
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", hash);
      return;
    }
    void navigate({ pathname: "/", hash });
  }

  const onLanding = location.pathname === "/";

  return (
    <header
      className={`z-30 border-b border-charcoal/8 bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur ${
        onLanding ? "sticky top-0" : "relative"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link
          to="/"
          className="font-display inline-flex min-h-tap items-center text-xl font-bold tracking-[0.18em] text-orange no-underline"
        >
          NIVO
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className="btn-secondary px-3 sm:hidden"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </button>

          {open ? (
            <button
              type="button"
              className="fixed inset-0 z-10 bg-charcoal/20 sm:hidden"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
          ) : null}

          <nav
            id="main-nav"
            aria-label="Main"
            className={`${
              open ? "flex" : "hidden"
            } absolute inset-x-3 top-[calc(100%+0.35rem)] z-20 max-h-[min(70dvh,28rem)] flex-col gap-1 overflow-y-auto rounded-2xl border border-charcoal/10 bg-white p-3 shadow-soft sm:static sm:z-auto sm:flex sm:max-h-none sm:flex-row sm:items-center sm:gap-0.5 sm:overflow-visible sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
          >
            {!user &&
              PUBLIC_NAV.map((n) => (
                <button
                  key={n.hash}
                  type="button"
                  className={`inline-flex min-h-tap w-full items-center rounded-xl px-3 text-left text-sm font-medium sm:w-auto ${
                    location.hash === n.hash ? "text-orange-dark" : "text-charcoal hover:text-orange-dark"
                  }`}
                  onClick={() => goSection(n.hash)}
                >
                  {n.label}
                </button>
              ))}
            {isAdmin && (
              <NavLink to="/admin/dashboard" className={link} onClick={() => setOpen(false)}>
                Admin
              </NavLink>
            )}
            {isConsultancy && (
              <NavLink to="/consultancy/dashboard" className={link} onClick={() => setOpen(false)}>
                Referrals
              </NavLink>
            )}
            {user ? (
              <div className="mt-1 flex w-full flex-col gap-2 border-t border-charcoal/10 pt-2 sm:ml-1 sm:mt-0 sm:w-auto sm:flex-row sm:items-center sm:border-0 sm:pt-0">
                <NavLink to={homePathFor(user)} className={link} onClick={() => setOpen(false)}>
                  Open app
                </NavLink>
              </div>
            ) : (
              <div className="mt-1 flex w-full flex-col gap-2 border-t border-charcoal/10 pt-2 sm:mt-0 sm:w-auto sm:flex-row sm:items-center sm:border-0 sm:pt-0">
                <NavLink to="/login" className={link} onClick={() => setOpen(false)}>
                  Log in
                </NavLink>
                <Link
                  to="/register"
                  className="btn-primary w-full px-4 text-center text-sm no-underline sm:ml-1 sm:w-auto"
                  onClick={() => setOpen(false)}
                >
                  Start your journey
                </Link>
              </div>
            )}
          </nav>

          {user ? (
            <button
              type="button"
              className="relative z-20 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-charcoal/10 bg-charcoal/[0.04] text-charcoal-soft transition-colors hover:border-charcoal/15 hover:bg-charcoal/[0.07] hover:text-charcoal"
              aria-label="Log out"
              title="Log out"
              onClick={() => {
                const role = user.role;
                void signOut().then(() => navigate(logoutPathFor(role), { replace: true }));
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
