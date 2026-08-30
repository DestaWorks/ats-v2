import { requirePageUser } from "@/lib/page-user";
import { hasCapability } from "@destaworks/domain/constants";
import type { GetTenantMembersResponse } from "@destaworks/contracts/validation/tenant";
import { ErrorState } from "@destaworks/ui/error-state";
import { apiGet } from "@/lib/api/server";
import { MembersView } from "./members-view";

/**
 * Workspace members (Phase 6.5) — the roster, invitations and removal for the ACTIVE workspace.
 *
 * Gated on `manageUsers`, matching `membershipService`: the roster is the only response in the
 * app that names every person in a workspace, so the page self-gates for a friendly refusal and
 * the service refuses again server-side. This is the tenant axis, not the platform one — an Owner
 * here administers their own workspace and can reach no other.
 */
export default async function WorkspacePage() {
  const user = await requirePageUser();

  if (!hasCapability(user.role, "manageUsers")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Managing workspace members is limited to Owners, Directors and Admins."
        />
      </div>
    );
  }

  const { members } = await apiGet<GetTenantMembersResponse>("/tenants/members");

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Workspace</h1>
        <p className="text-sm text-gray">
          {members.length} {members.length === 1 ? "member" : "members"} — invite colleagues, set
          their role, and remove access.
        </p>
      </header>

      <MembersView initial={members} currentUserId={user.user.id} />
    </div>
  );
}
