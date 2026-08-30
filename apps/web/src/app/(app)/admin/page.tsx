import { hasCapability } from "@destaworks/domain/constants";
import { requirePageUser } from "@/lib/page-user";
import type {
  AccessRequestListDTO,
  AdminUserListDTO,
} from "@destaworks/contracts/validation/admin";
import type { AiSettingsDTO, AiUsageOverviewDTO } from "@destaworks/contracts/validation/ai-ops";
import type { PortalAccessRequestListDTO } from "@destaworks/contracts/validation/portal";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { ErrorState } from "@destaworks/ui/error-state";
import { apiGet } from "@/lib/api/server";
import { AdminDashboard } from "./admin-dashboard";

/**
 * Admin (Wave 5.3) — Users / Access Requests / Roles / Blocked. Gated `manageUsers` (the
 * broadest of the three admin capabilities used here); the `/admin/*` endpoints enforce the
 * precise capability per action, so this is a friendly no-access screen + the real gate,
 * matching `/crm`'s pattern. Team/Profiles and Audit tabs are intentionally out of scope here —
 * see `docs/IMPLEMENTATION-PLAN.md` Wave 5.3 notes.
 */
export default async function AdminPage() {
  const user = await requirePageUser();

  if (!hasCapability(user.role, "manageUsers")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Admin is limited to Owner and Admin roles."
        />
      </div>
    );
  }

  const canConfigurePortal = hasCapability(user.role, "configureClientPortal");
  const canManageAi = hasCapability(user.role, "manageAiSettings");
  const [{ users }, { requests }, portalRequests, clients, aiSettings, aiUsage] = await Promise.all(
    [
      apiGet<AdminUserListDTO>("/admin/users"),
      apiGet<AccessRequestListDTO>("/admin/access-requests"),
      canConfigurePortal
        ? apiGet<PortalAccessRequestListDTO>("/admin/portal/requests").then((r) => r.requests)
        : Promise.resolve([]),
      canConfigurePortal
        ? apiGet<LookupOptionsDTO>("/lookups").then((r) => r.clients)
        : Promise.resolve([]),
      canManageAi
        ? apiGet<AiSettingsDTO>("/admin/ai/settings")
        : Promise.resolve({ disabled: false, disabledReason: null }),
      canManageAi
        ? apiGet<AiUsageOverviewDTO>("/admin/ai/usage")
        : Promise.resolve({
            windowHours: 24,
            totalCalls: 0,
            successCount: 0,
            errorCount: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            avgLatencyMs: 0,
            recent: [],
          }),
    ],
  );

  return (
    <AdminDashboard
      initialUsers={users}
      initialRequests={requests}
      currentUserId={user.user.id}
      canConfigurePortal={canConfigurePortal}
      initialPortalRequests={portalRequests}
      clients={clients}
      canManageAi={canManageAi}
      initialAiSettings={aiSettings}
      aiUsage={aiUsage}
    />
  );
}
