import { redirect } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { adminUserService } from "@/server/services/admin-user.service";
import { accessRequestService } from "@/server/services/access-request.service";
import { ErrorState } from "@/components/ui/error-state";
import { AdminDashboard } from "./admin-dashboard";

/**
 * Admin (Wave 5.3) — Users / Access Requests / Roles / Blocked. Gated `manageUsers` (the
 * broadest of the three admin capabilities used here); the `/api/admin/*` routes enforce the
 * precise capability per action, so this is a friendly no-access screen + the real gate,
 * matching `/crm`'s pattern. Team/Profiles and Audit tabs are intentionally out of scope here —
 * see `docs/IMPLEMENTATION-PLAN.md` Wave 5.3 notes.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

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

  const [{ users }, requests] = await Promise.all([
    adminUserService.list(),
    accessRequestService.list(),
  ]);

  return <AdminDashboard initialUsers={users} initialRequests={requests} currentUserId={user.id} />;
}
