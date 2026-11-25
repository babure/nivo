import { useEffect, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import type { SessionUser } from "../lib/auth";

export type WorkspaceNavItem = {
  to: string;
  label: string;
  end?: boolean;
  description?: string;
  icon: LucideIcon;
};

type Props = {
  brandHref: string;
  brandLabel?: string;
  eyebrow: string;
  title: string;
  nav: WorkspaceNavItem[];
  user: SessionUser | null | undefined;
  onLogout: () => void;
  children: ReactNode;
  mobileNav?: boolean;
};

function ProfileAvatar({
  user,
  initial,
}: {
  user: SessionUser | null | undefined;
  initial: string;
}) {
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="h-9 w-9 shrink-0 rounded-full border border-charcoal/10 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange/15 text-sm font-semibold text-orange-dark"
    >
      {initial}
    </span>
  );
}

export function WorkspaceShell({
  brandHref,
  brandLabel = "NIVO",
  eyebrow,
  title,
  nav,
  user,
  onLogout,
  children,
  mobileNav = false,
}: Props) {
  const location = useLocation();
  const active = nav.find((n) =>
    n.end ? location.pathname === n.to : location.pathname === n.to || location.pathname.startsWith(`${n.to}/`),
  );
  const fullName = user?.fullName?.trim() || eyebrow;
  const email = user?.email ?? "";
  const initial = (user?.fullName ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  const ActiveIcon = active?.icon;
  const identityLabel = [fullName, email].filter(Boolean).join(" · ");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-paper text-charcoal">
      <div className="flex min-h-screen min-h-[100dvh] w-full">
        <aside className="sticky top-0 hidden h-screen h-[100dvh] w-56 shrink-0 flex-col border-r border-charcoal/10 bg-paper px-3 py-5 md:flex">
          <NavLink
            to={brandHref}
            className="font-display mb-0.5 px-2 text-lg font-bold tracking-[0.18em] text-orange no-underline"
          >
            {brandLabel}
          </NavLink>
          <p className="mb-6 px-2 text-xs text-charcoal-soft">{eyebrow}</p>

          <nav aria-label={title} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {nav.map((n) => {
              const Icon = n.icon;
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  title={n.description}
                  className={({ isActive }) => (isActive ? "nav-rail-link-active" : "nav-rail-link-idle")}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden strokeWidth={1.75} />
                  <span className="truncate">{n.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-charcoal/10 px-1.5 pt-4">
            <div className="group relative flex items-center gap-1.5 rounded-xl px-1 py-1">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <ProfileAvatar user={user} initial={initial} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-charcoal">{fullName}</p>
                  <p className="truncate text-xs text-charcoal-soft">{email}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost h-9 w-9 shrink-0 rounded-xl p-0 text-charcoal-soft hover:bg-charcoal/[0.06] hover:text-charcoal"
                onClick={onLogout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-4 w-4" aria-hidden strokeWidth={1.75} />
              </button>

              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-0 z-20 hidden w-[15rem] rounded-xl border border-charcoal/10 bg-white p-3 shadow-soft group-hover:block group-focus-within:block"
              >
                <p className="text-sm font-medium text-charcoal">{fullName}</p>
                <p className="mt-0.5 break-all text-xs text-charcoal-soft">{email || "No email"}</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-charcoal/10 bg-paper/95 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              {ActiveIcon ? (
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange/10 text-orange-dark">
                  <ActiveIcon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
                </span>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-charcoal-soft md:hidden">{eyebrow}</p>
                <h1 className="truncate font-display text-base font-semibold tracking-tight text-charcoal">
                  {active?.label ?? title}
                </h1>
                {active?.description ? (
                  <p className="hidden truncate text-xs text-charcoal-soft sm:block">{active.description}</p>
                ) : null}
              </div>
            </div>

            {/* Mobile only — desktop logs out from the sidebar profile row */}
            <div className="group relative flex shrink-0 items-center gap-1 md:hidden">
              <div
                className="flex items-center"
                title={identityLabel}
              >
                <ProfileAvatar user={user} initial={initial} />
              </div>
              <button
                type="button"
                className="btn-ghost h-9 w-9 rounded-xl p-0 text-charcoal-soft hover:text-charcoal"
                onClick={onLogout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-4 w-4" aria-hidden strokeWidth={1.75} />
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 top-[calc(100%+0.4rem)] z-40 hidden w-[14rem] rounded-xl border border-charcoal/10 bg-white p-3 text-left shadow-soft group-hover:block group-focus-within:block"
              >
                <p className="text-sm font-medium text-charcoal">{fullName}</p>
                <p className="mt-0.5 break-all text-xs text-charcoal-soft">{email || "No email"}</p>
              </div>
            </div>
          </header>

          <main className={`min-w-0 flex-1 overflow-x-clip ${mobileNav ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
            {children}
          </main>

          {mobileNav && (
            <nav
              aria-label={`${title} mobile`}
              className="fixed inset-x-0 bottom-0 z-30 border-t border-charcoal/10 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            >
              <div className="flex gap-0.5 overflow-x-auto px-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {nav.map((n) => {
                  const Icon = n.icon;
                  return (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      className={({ isActive }) =>
                        [
                          "flex min-h-tap min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] font-medium leading-tight no-underline sm:min-w-[5rem] sm:text-[11px]",
                          isActive ? "text-orange-dark" : "text-charcoal-soft",
                        ].join(" ")
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden strokeWidth={1.75} />
                      <span className="max-w-[4.75rem] truncate text-center">{n.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
