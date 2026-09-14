"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  ClipboardIcon,
  SunIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  Squares2X2Icon,
  CheckBadgeIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  BriefcaseIcon,
  DocumentDuplicateIcon,
  AcademicCapIcon,
  UserCircleIcon,
  ArrowUpTrayIcon,
  ClockIcon,
  IdentificationIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
  PresentationChartLineIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@destaworks/domain/utils/cn";
import { activeNavHref, groupNavItems, type NavIconKey, type NavItem } from "./lib/nav";
import { AddCandidateButton } from "./add-candidate-modal";
import type { ClientOption } from "./candidates/new/add-candidate-form";

/** `NavIconKey` → actual icon component — the only place `nav.ts`'s framework-agnostic keys
 *  become React (see that file's docstring on why the mapping lives here, not there). */
const ICONS: Record<NavIconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  home: HomeIcon,
  clipboard: ClipboardIcon,
  sun: SunIcon,
  calendar: CalendarIcon,
  search: MagnifyingGlassIcon,
  sparkles: SparklesIcon,
  board: Squares2X2Icon,
  check: CheckBadgeIcon,
  shield: ShieldCheckIcon,
  users: UserGroupIcon,
  briefcase: BriefcaseIcon,
  documents: DocumentDuplicateIcon,
  academic: AcademicCapIcon,
  profile: UserCircleIcon,
  upload: ArrowUpTrayIcon,
  clock: ClockIcon,
  id: IdentificationIcon,
  building: BuildingOffice2Icon,
  chart: ChartBarIcon,
  trending: PresentationChartLineIcon,
  settings: Cog6ToothIcon,
};

/**
 * The app-shell **left sidebar** (legacy parity). The brand/user chrome lives in `AppHeader`;
 * this column is nav links (active = FILLED navy pill, legacy style) grouped under static section
 * labels (Home/Recruiting/Tools/Client/Insights — see `nav.ts`'s `groupNavItems`), plus the action
 * cluster at the bottom: green "+ Add Candidate" (opens the shared modal) and the purple "Parse
 * Resume" link. `.no-print` hides it in printable views.
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
  const sections = groupNavItems(items);
  const closeMobile = () => setMobileOpen(false);

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

      {/* Nav panel: always shown as a column on md+, toggled inline on mobile. `overflow-y-auto`
          lets the (now taller, with icons + section labels) item list scroll WITHIN this fixed-
          height column — without it, overflow just pushes the bottom action cluster off-screen
          instead of scrolling. */}
      <div
        id="app-nav-panel"
        className={cn(
          "flex-col gap-3 px-3 pt-3 pb-4 md:flex md:flex-1 md:overflow-y-auto",
          mobileOpen ? "flex" : "hidden",
        )}
      >
        <div className="flex flex-col gap-1">
          {sections.map((section, sectionIndex) => {
            if (section.group === null) {
              const item = section.items[0];
              if (!item) return null;
              return (
                <ul key={item.href}>
                  <li>
                    <NavLink item={item} isActive={item.href === active} onNavigate={closeMobile} />
                  </li>
                </ul>
              );
            }

            return (
              <div key={section.group} className={sectionIndex > 0 ? "mt-2" : undefined}>
                <p className="px-4 py-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
                  {section.group}
                </p>
                <ul className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <NavLink
                        item={item}
                        isActive={item.href === active}
                        onNavigate={closeMobile}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

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
            onClick={closeMobile}
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

/** One sidebar link: icon (if the item has one) + label, filled navy pill when active. */
function NavLink({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon ? ICONS[item.icon] : null;
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition",
        "focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
        isActive ? "bg-navy font-semibold text-white shadow-sm" : "text-charcoal hover:bg-black/5",
      )}
    >
      {/* The icon is deliberately quieter than the label — gray at rest, soft white when active
          on the navy pill — never the same full-strength color as the text next to it. */}
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-white/70" : "text-gray")}
        />
      ) : null}
      {item.label}
    </Link>
  );
}
