"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@destaworks/domain/utils/cn";
import type { ConsoleNavItem } from "./nav";

export function ConsoleNav({ items }: { items: readonly ConsoleNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Platform console" className="w-full shrink-0 md:w-56">
      <ul className="flex flex-row gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap",
                  active ? "bg-navy text-white" : "text-charcoal hover:bg-black/5",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
