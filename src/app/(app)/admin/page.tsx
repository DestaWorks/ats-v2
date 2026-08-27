import { hasCapability } from "@/lib/constants";
import { getVerifiedUser } from "@/server/auth/guards";
import { adminUserService } from "@/server/services/admin-user.service";
import { accessRequestService } from "@/server/services/access-request.service";
import { portalAccessRequestService } from "@/server/services/portal-access-request.service";
import { aiOpsService } from "@/server/services/ai-ops.service";
import { ErrorState } from "@/components/ui/error-state";
import { AdminDashboard } from "./admin-dashboard";
import { cachedClientList } from "@/server/http/request-cache";

/**
 * Admin (Wave 5.3) — Users / Access Requests / Roles / Blocked. Gated `manageUsers` (the
 * broadest of the three admin capabilities used here); the `/api/admin/*` routes enforce the
 * precise capability per action, so this is a friendly no-access screen + the real gate,
 * matching `/crm`'s pattern. Team/Profiles and Audit tabs are intentionally out of scope here —
 * see `docs/IMPLEMENTATION-PLAN.md` Wave 5.3 notes.
 */
export default async function AdminPage() {
  const user = await getVerifiedUser();

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
  const [{ users }, requests, portalRequests, clientRows, aiSettings, aiUsage] = await Promise.all([
    adminUserService.list(),
    accessRequestService.list(),
    canConfigurePortal ? portalAccessRequestService.list() : Promise.resolve([]),
    canConfigurePortal ? cachedClientList() : Promise.resolve([]),
    canManageAi
      ? aiOpsService.getSettings()
      : Promise.resolve({ disabled: false, disabledReason: null }),
    canManageAi
      ? aiOpsService.getUsageOverview()
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
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <AdminDashboard
      initialUsers={users}
      initialRequests={requests}
      currentUserId={user.id}
      canConfigurePortal={canConfigurePortal}
      initialPortalRequests={portalRequests}
      clients={clients}
      canManageAi={canManageAi}
      initialAiSettings={aiSettings}
      aiUsage={aiUsage}
    />
  );
}
