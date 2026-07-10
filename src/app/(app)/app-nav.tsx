"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { activeNavHref, type NavItem } from "./lib/nav";
import { AddCandidateButton } from "./add-candidate-modal";
import type { ClientOption } from "./candidates/new/add-candidate-form";

/**
 * The app-shell **left sidebar** (legacy parity). The brand/user chrome lives in `AppHeader`;
 * this column is nav links (active = FILLED navy pill, legacy style) plus the action cluster at
 * the bottom: green "+ Add Candidate" (opens the shared modal) and the purple "Parse Resume"
 * link. `.no-print` hides it in printable views.
 *
 * On small screens it collapses to a slim "Menu" bar whose hamburger expands the panel inline
 * (pushing content down, never overlaying it).
 */
export function AppNav({
  items,
  clients,
  canEditCredential,
}: {
  items: NavItem[];
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
    <nav className="no-print flex flex-col border-b border-black/10 bg-white md:sticky md:top-[53px] md:h-[calc(100vh-53px)] md:w-60 md:shrink-0 md:border-r md:border-b-0">
      {/* Mobile-only menu bar (the brand lives in the header). */}
      <div className="flex items-center justify-between px-4 py-2 md:hidden">
        <span className="text-sm font-semibold text-gray">Menu</span>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          aria-controls="app-nav-panel"
          aria-label="Toggle navigation"
          className="rounded-md p-1.5 text-charcoal transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
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
        className={cn(
          "flex-col gap-3 px-3 pt-3 pb-4 md:flex md:flex-1",
          mobileOpen ? "flex" : "hidden",
        )}
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
                    "block rounded-lg px-4 py-2.5 text-sm font-medium transition",
                    "focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
                    isActive
                      ? "bg-navy font-semibold text-white shadow-sm"
                      : "text-charcoal hover:bg-black/5",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Bottom action cluster (legacy: green + Add Candidate · purple Parse Resume). */}
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-black/5 pt-4">
          <AddCandidateButton
            clients={clients}
            canEditCredential={canEditCredential}
            variant="success"
            size="sm"
            className="px-2 leading-snug"
            label={
              <>
                + Add
                <br />
                Candidate
              </>
            }
          />
          <Link
            href="/resume"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center rounded-md bg-purple px-2 text-sm leading-snug font-semibold text-white transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          >
            Parse
            <br />
            Resume
          </Link>
        </div>
      </div>
    </nav>
  );
}
