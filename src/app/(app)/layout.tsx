import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { hasCapability } from "@/lib/constants";
import { AppNav } from "./app-nav";
import { BASE_NAV_ITEMS, type NavItem } from "./lib/nav";

/**
 * App-shell layout for every `(app)` route (server component). Three jobs:
 *
 * 1. **Auth safety-net.** A single `getCurrentUser()` guard → `redirect("/sign-in")` so no future
 *    `(app)` page can fail open. Individual pages keep their own `getCurrentUser()` (they need the
 *    user object for data + capability flags); this is an additional guard, not a replacement.
 * 2. **Chrome.** A persistent, capability-gated **left sidebar** (client `AppNav`) + a
 *    skip-to-content link, with page content in a single `<main id="content">` (the skip target) to
 *    the sidebar's right. The **Import** link is appended only for viewers with `bulkImport` — UI
 *    hiding is UX; the route stays server-guarded. (Add-candidate lives on the pages, not the nav.)
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const items: NavItem[] = [...BASE_NAV_ITEMS];
  if (hasCapability(user.role, "bulkImport")) {
    items.push({ href: "/migration", label: "Import" });
  }

  return (
    <>
      <a
        href="#content"
        className="sr-only rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen flex-col md:flex-row">
        <AppNav items={items} userName={user.name} userRole={user.role} />
        <main id="content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </>
  );
}
