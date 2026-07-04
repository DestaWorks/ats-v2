"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { activeNavHref, type NavItem } from "./lib/nav";
import { SignOutButton } from "./sign-out-button";
import { AddCandidateButton } from "./add-candidate-modal";
import type { ClientOption } from "./candidates/new/add-candidate-form";

/**
 * The persistent app-shell **left sidebar** (client — needs `usePathname` to highlight the active
 * item). The server layout owns auth, the capability-gated `items` list, and the `clients` list for
 * the add-candidate modal; this component is presentation only. `.no-print` hides it in printable
 * views (reports/credentials).
 *
 * Layout: a fixed-width column on `md+` (`w-60`, sticky full-height); on small screens it collapses
 * to a top bar with an accessible hamburger that expands the nav panel *inline* (pushing content
 * down, never overlaying/hiding it). Top→bottom: brand · nav links (active = `aria-current`) ·
 * prominent "+ Add candidate" modal trigger · spacer · user name·role + Sign out.
 */
export function AppNav({
  items,
  userName,
  userRole,
  clients,
  canEditCredential,
}: {
  items: NavItem[];
  userName: string;
  userRole: string;
  clients: ClientOption[];
  canEditCredential: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = activeNavHref(
    pathname,
    items.map((i) => i.href),
  );

  return (
    <nav className="no-print flex flex-col border-b border-black/10 bg-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
      {/* Brand + mobile hamburger */}
      <div className="flex items-center justify-between px-4 py-3 md:py-4">
        <Link
          href="/dashboard"
          onClick={() => setMobileOpen(false)}
          className="text-sm font-bold tracking-tight text-navy focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
        >
          DestaHealth ATS
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          aria-controls="app-nav-panel"
          aria-label="Toggle navigation"
          className="rounded-md p-1.5 text-charcoal transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none md:hidden"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="h-5 w-5"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
      </div>

      {/* Nav panel: always shown as a column on md+, toggled inline on mobile. */}
      <div
        id="app-nav-panel"
        className={cn("flex-col gap-3 px-3 pb-4 md:flex md:flex-1", mobileOpen ? "flex" : "hidden")}
      >
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const isActive = item.href === active;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition",
                    "focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
                    isActive
                      ? "bg-navy/10 font-semibold text-navy"
                      : "text-charcoal hover:bg-black/5",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <AddCandidateButton
          clients={clients}
          canEditCredential={canEditCredential}
          className="w-full"
        />

        {/* Spacer pushes the user block to the bottom of the full-height column. */}
        <div className="mt-auto flex flex-col gap-2 border-t border-black/5 pt-4">
          <span className="px-1 text-sm text-gray">
            {userName} · <span className="font-semibold text-charcoal">{userRole}</span>
          </span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
