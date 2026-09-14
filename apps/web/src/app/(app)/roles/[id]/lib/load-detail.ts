import "server-only";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/page-user";
import type { GetRoleResponse } from "@destaworks/contracts/validation/open-role";
import type { GetRoleMatchesAndDormantResponse } from "@destaworks/contracts/validation/open-role";
import type { LookupOptionsDTO } from "@destaworks/contracts/validation/lookups";
import { apiGet } from "@/lib/api/server";
import { AppError } from "@destaworks/integrations/http/app-error";

/** Shared RSC loader for `/roles/[id]` — one place owns the guard → composite-read → NOT_FOUND mapping. */
export async function loadRoleDetail(id: string) {
  const user = await requirePageUser();

  let role;
  try {
    ({ role } = await apiGet<GetRoleResponse>(`/roles/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [{ matches, dormantMatches }, { clients }] = await Promise.all([
    apiGet<GetRoleMatchesAndDormantResponse>(
      `/roles/${encodeURIComponent(id)}/matches-and-dormant`,
    ),
    apiGet<LookupOptionsDTO>("/lookups"),
  ]);

  return { role, matches, dormantMatches, clients, user };
}
