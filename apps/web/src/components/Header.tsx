import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const PUBLIC_NAV = [
  { hash: "#path", label: "The path" },
  { hash: "#how-it-works", label: "How it works" },
  { hash: "#faq", label: "FAQ" },
  { hash: "#about", label: "Contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-tap items-center rounded-xl px-3 text-sm font-medium no-underline ${
      isActive ? "text-orange-dark" : "text-charcoal hover:text-orange-dark"
    }`;

  const isAdmin = user?.role === "admin";
  const isConsultancy = user?.role === "consultancy";

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

  return (
    <header className="relative z-20 border-b border-charcoal/8 bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5 sm:px-6">
        <Link
          to="/"
          className="font-display inline-flex min-h-tap items-center text-xl font-bold tracking-[0.18em] text-orange no-underline"
        >
          NIVO
        </Link>

        <button
          type="button"
          className="btn-secondary px-3 sm:hidden"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>

        <nav
          id="main-nav"
          aria-label="Main"
          className={`${
            open ? "flex" : "hidden"
          } absolute inset-x-3 top-14 flex-col gap-1 rounded-2xl border border-charcoal/10 bg-white p-3 shadow-soft sm:static sm:flex sm:flex-row sm:items-center sm:gap-0.5 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
        >
          {!user &&
            PUBLIC_NAV.map((n) => (
              <button
                key={n.hash}
                type="button"
                className={`inline-flex min-h-tap items-center rounded-xl px-3 text-left text-sm font-medium ${
                  location.hash === n.hash ? "text-orange-dark" : "text-charcoal hover:text-orange-dark"
                }`}
                onClick={() => goSection(n.hash)}
              >
                {n.label}
              </button>
            ))}
          {isAdmin && (
            <NavLink to="/admin/students" className={link} onClick={() => setOpen(false)}>
              Admin
            </NavLink>
          )}
          {isConsultancy && (
            <NavLink to="/consultancy/dashboard" className={link} onClick={() => setOpen(false)}>
              Referrals
            </NavLink>
          )}
          {user ? (
            <div className="ml-1 flex items-center gap-2">
              <NavLink
                to={
                  isAdmin
                    ? "/admin/students"
                    : isConsultancy
                      ? "/consultancy/dashboard"
                      : user.paymentStatus === "paid"
                        ? "/dashboard"
                        : "/pay"
                }
                className={link}
                onClick={() => setOpen(false)}
              >
                Open app
              </NavLink>
              <button type="button" className="btn-secondary" onClick={() => void signOut()}>
                Log out
              </button>
            </div>
          ) : (
            <>
              <NavLink to="/login" className={link} onClick={() => setOpen(false)}>
                Log in
              </NavLink>
              <Link
                to="/register"
                className="btn-primary ml-1 px-4 text-sm no-underline"
                onClick={() => setOpen(false)}
              >
                Start your journey
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
