import { redirect } from "next/navigation";
import { getCurrentUser, getSignedInIdentity } from "@destaworks/auth/guards";
import { hasCapability } from "@destaworks/domain/constants";
import { StickyNote } from "@/components/sticky-note";
import { AppHeader } from "./app-header";
import { AppNav } from "./app-nav";
import { BASE_NAV_ITEMS, type NavItem } from "./lib/nav";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import type { GetTenantsResponse } from "@destaworks/contracts/validation/tenant";
import { apiGet } from "@/lib/api/server";

/**
 * App-shell layout for every `(app)` route (server component). Four jobs:
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
 * 4. **Global widgets.** `<StickyNote>` (Wave 4.1) mounts once here — a floating per-user
 *    scratchpad available from every view, matching legacy.
 *
 * The `modal` parallel slot hosts ROUTE-intercepted overlays (the candidate detail opened
 * in-app renders there, over the still-mounted board/list); it is `null` otherwise.
 */
export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    // A null context means one of two very different things. No session is a sign-in problem;
    // a session that resolves to no tenant is a CHOICE the person has not made yet — two
    // memberships and no claim resolve `ambiguous` rather than silently picking one. Sending
    // that case to /sign-in strands them: the shell never renders, so the switcher inside it
    // can never be reached.
    redirect((await getSignedInIdentity()) ? "/choose-workspace" : "/sign-in");
  }

  const items: NavItem[] = [...BASE_NAV_ITEMS];
  if (hasCapability(user.role, "bulkImport")) {
    items.push({ href: "/migration", label: "Import", group: "Recruiting", icon: "upload" });
  }
  if (hasCapability(user.role, "viewAudit")) {
    items.push({ href: "/activity", label: "Activity", group: "Tools", icon: "clock" });
  }
  if (hasCapability(user.role, "viewCredentials")) {
    items.push({ href: "/credentials", label: "Credentials", group: "Tools", icon: "id" });
  }
  if (hasCapability(user.role, "viewCrm")) {
    items.push({ href: "/crm", label: "CRM", group: "Client", icon: "building" });
  }
  if (hasCapability(user.role, "viewClientDiscovery")) {
    items.push({
      href: "/client-discovery",
      label: "Client Discovery",
      group: "Client",
      icon: "trending",
    });
  }
  if (hasCapability(user.role, "viewReports")) {
    items.push({ href: "/weekly-brief", label: "Weekly Brief", group: "Home", icon: "calendar" });
    items.push({ href: "/reports", label: "Reports", group: "Insights", icon: "chart" });
  }
  if (hasCapability(user.role, "manageUsers")) {
    items.push({ href: "/workspace", label: "Workspace", icon: "users" });
    items.push({ href: "/admin", label: "Admin", icon: "settings" });
  }

  const [{ clients: clientRows }, { tenants }] = await Promise.all([
    apiGet<LookupOptionsDTO>("/lookups"),
    apiGet<GetTenantsResponse>("/tenants"),
  ]);
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
        <AppHeader
          userName={user.user.name}
          userEmail={user.user.email}
          userRole={user.role}
          userImage={user.user.image ?? null}
          tenants={tenants}
          activeTenantId={user.tenantId}
        />
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
      {modal}
      <StickyNote />
    </>
  );
}
