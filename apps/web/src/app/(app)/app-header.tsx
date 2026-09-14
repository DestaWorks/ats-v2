import type { TenantChoiceDTO } from "@destaworks/contracts/validation/tenant";
import { AlertsBell } from "./alerts-bell";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * The app-shell TOP header (legacy parity): serif DESTA WORKS wordmark + "ATS" on the left;
 * Alerts pill · account menu (avatar + name/role → My Profile / Sign out) on the right. Server
 * component — the interactive children (`AlertsBell`, `UserMenu`) are client components.
 */
export function AppHeader({
  userName,
  userEmail,
  userRole,
  userImage,
  tenants,
  activeTenantId,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
  userImage: string | null;
  tenants: TenantChoiceDTO[];
  activeTenantId: string;
}) {
  return (
    <header className="no-print sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-black/10 bg-white px-5 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-lg font-semibold tracking-[0.18em] whitespace-nowrap">
          <span className="text-charcoal">DESTA</span>
          <span className="text-brand">WORKS</span>
        </span>
        <span aria-hidden="true" className="text-black/15">
          |
        </span>
        <span className="text-sm font-bold tracking-wide text-navy">ATS</span>
      </div>

      <div className="flex items-center gap-3">
        <WorkspaceSwitcher tenants={tenants} activeTenantId={activeTenantId} />
        <AlertsBell viewerFirstName={userName.split(" ")[0] ?? userName} />
        <UserMenu userName={userName} userEmail={userEmail} userRole={userRole} image={userImage} />
      </div>
    </header>
  );
}
