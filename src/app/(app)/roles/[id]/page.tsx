import { hasCapability } from "@/lib/constants";
import { RoleDetail } from "./role-detail";
import { loadRoleDetail } from "./lib/load-detail";

/** Role detail — full page (hard load, deep link, board-card click). */
export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, matches, dormantMatches, clients, user } = await loadRoleDetail(id);

  return (
    <RoleDetail
      initial={role}
      matches={matches}
      dormantMatches={dormantMatches}
      clients={clients}
      canManageWeights={hasCapability(user.role, "viewReports")}
    />
  );
}
