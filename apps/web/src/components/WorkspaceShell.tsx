import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type WorkspaceNavItem = {
  to: string;
  label: string;
  end?: boolean;
  description?: string;
};

type Props = {
  brandHref: string;
  brandLabel?: string;
  eyebrow: string;
  title: string;
  nav: WorkspaceNavItem[];
  userSlot: ReactNode;
  children: ReactNode;
  mobileNav?: boolean;
};

export function WorkspaceShell({
  brandHref,
  brandLabel = "NIVO",
  eyebrow,
  title,
  nav,
  userSlot,
  children,
  mobileNav = false,
}: Props) {
  return (
    <div className="min-h-screen bg-paper text-charcoal">
      <div className="mx-auto flex min-h-screen max-w-shell">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-charcoal/10 bg-paper px-2.5 py-5 md:flex">
          <NavLink
            to={brandHref}
            className="font-display mb-0.5 px-3 text-lg font-bold tracking-[0.18em] text-orange no-underline"
          >
            {brandLabel}
          </NavLink>
          <p className="mb-5 px-3 text-xs text-charcoal-soft">{eyebrow}</p>
          <nav aria-label={title} className="flex flex-1 flex-col gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => (isActive ? "nav-rail-link-active" : "nav-rail-link-idle")}
              >
                <span>
                  <span className="block">{n.label}</span>
                  {n.description ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-charcoal-soft">{n.description}</span>
                  ) : null}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-charcoal/10 px-2 pt-4">{userSlot}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-charcoal/10 bg-paper/95 px-4 py-3 backdrop-blur md:hidden">
            <div>
              <NavLink to={brandHref} className="font-display text-base font-bold tracking-[0.16em] text-orange no-underline">
                {brandLabel}
              </NavLink>
              <p className="text-[11px] text-charcoal-soft">{eyebrow}</p>
            </div>
            {userSlot}
          </header>

          <main className={`flex-1 ${mobileNav ? "pb-24 md:pb-0" : ""}`}>{children}</main>

          {mobileNav && (
            <nav
              aria-label={`${title} mobile`}
              className="fixed inset-x-0 bottom-0 z-10 flex gap-1 overflow-x-auto border-t border-charcoal/10 bg-paper/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden"
            >
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    [
                      "flex min-h-tap min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg px-2 text-[11px] font-semibold no-underline",
                      isActive ? "text-orange-dark" : "text-charcoal-soft",
                    ].join(" ")
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
