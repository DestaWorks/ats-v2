import "server-only";
import { notFound } from "next/navigation";
import { getVerifiedUser } from "@/server/auth/guards";
import { openRoleService } from "@/server/services/open-role.service";
import { AppError } from "@/server/http/app-error";
import { cachedClientList } from "@/server/http/request-cache";

/** Shared RSC loader for `/roles/[id]` — one place owns the guard → composite-read → NOT_FOUND mapping. */
export async function loadRoleDetail(id: string) {
  const user = await getVerifiedUser();

  let role;
  try {
    role = await openRoleService.detail(id);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [{ matches, dormantMatches }, clientRows] = await Promise.all([
    openRoleService.matchesAndDormant(id),
    cachedClientList(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return { role, matches, dormantMatches, clients, user };
}
