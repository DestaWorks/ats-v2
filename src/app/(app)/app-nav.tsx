"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { activeNavHref, type NavItem } from "./lib/nav";
import { SignOutButton } from "./sign-out-button";

/**
 * The persistent app-shell top nav (client — needs `usePathname` to highlight the active item).
 * The server layout owns auth + the capability-gated `items` list and passes them down; this
 * component is presentation only. `.no-print` hides it in printable views (reports/credentials).
 */
export function AppNav({
  items,
  userName,
  userRole,
}: {
  items: NavItem[];
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const active = activeNavHref(
    pathname,
    items.map((i) => i.href),
  );

  return (
    <nav className="no-print border-b border-black/10 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/dashboard" className="text-sm font-bold tracking-tight text-navy">
          DestaHealth ATS
        </Link>

        <ul className="flex flex-wrap items-center gap-1">
          {items.map((item) => {
            const isActive = item.href === active;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition",
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

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray">
            {userName} · <span className="font-semibold text-charcoal">{userRole}</span>
          </span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
