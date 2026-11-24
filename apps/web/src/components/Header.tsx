import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

const PUBLIC_NAV = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/services", label: "Services" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
];

const STUDENT_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/accommodation", label: "Accommodation" },
  { to: "/documents", label: "Documents" },
  { to: "/profile", label: "Profile" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();

  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-tap items-center rounded-xl px-3 text-sm font-medium no-underline ${
      isActive ? "text-orange-dark" : "text-charcoal hover:text-orange-dark"
    }`;

  const isStudent = user && user.role === "student";
  const isAdmin = user?.role === "admin";
  const isConsultancy = user?.role === "consultancy";

  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
        <Link to="/" className="inline-flex min-h-tap items-center text-xl font-extrabold tracking-[0.2em] text-orange no-underline">
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
          } absolute inset-x-3 top-14 flex-col gap-1 rounded-2xl border border-charcoal/10 bg-white p-3 shadow-lg sm:static sm:flex sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
          onClick={() => setOpen(false)}
        >
          {!user &&
            PUBLIC_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={link}>
                {n.label}
              </NavLink>
            ))}
          {isStudent &&
            STUDENT_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={link}>
                {n.label}
              </NavLink>
            ))}
          {isAdmin && (
            <NavLink to="/admin" className={link}>
              Admin
            </NavLink>
          )}
          {isConsultancy && (
            <NavLink to="/consultancy/dashboard" className={link}>
              Consultancy
            </NavLink>
          )}
          {user ? (
            <button type="button" className="btn-secondary" onClick={() => void signOut()}>
              Log out
            </button>
          ) : (
            <NavLink to="/login" className={link}>
              Log in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
