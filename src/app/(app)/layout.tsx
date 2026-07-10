import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { hasCapability } from "@/lib/constants";
import { clientRepository } from "@/server/repositories/client.repository";
import { AppHeader } from "./app-header";
import { AppNav } from "./app-nav";
import { BASE_NAV_ITEMS, type NavItem } from "./lib/nav";

/**
 * App-shell layout for every `(app)` route (server component). Three jobs:
 *
 * 1. **Auth safety-net.** A single `getCurrentUser()` guard → `redirect("/sign-in")` so no future
 *    `(app)` page can fail open. Individual pages keep their own `getCurrentUser()` (they need the
 *    user object for data + capability flags); this is an additional guard, not a replacement.
 * 2. **Chrome (legacy parity).** A TOP header (`AppHeader`: serif DESTAWORKS wordmark, Alerts,
 *    avatar + name/role, Sign out) over a capability-gated **left sidebar** (client `AppNav` with
 *    filled-navy active pills + the green Add-Candidate / purple Parse-Resume cluster), with page
 *    content in `<main id="content">` (the skip target). The **Import** link is appended only for
 *    viewers with `bulkImport` — UI hiding is UX; the route stays server-guarded.
 * 3. **Shared data.** `clients` for the sidebar's add-candidate modal, fetched once here.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const items: NavItem[] = [...BASE_NAV_ITEMS];
  if (hasCapability(user.role, "bulkImport")) {
    items.push({ href: "/migration", label: "Import" });
  }
  if (hasCapability(user.role, "viewAudit")) {
    items.push({ href: "/activity", label: "Activity" });
  }

  const clientRows = await clientRepository.list();
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <a
        href="#content"
        className="sr-only rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen flex-col">
        <AppHeader userName={user.name} userRole={user.role} />
        <div className="flex flex-1 flex-col md:flex-row">
          <AppNav
            items={items}
            clients={clients}
            canEditCredential={hasCapability(user.role, "viewCredentials")}
          />
          <main id="content" className="min-w-0 flex-1 bg-surface/40">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
