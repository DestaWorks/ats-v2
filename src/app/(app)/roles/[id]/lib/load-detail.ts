import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { openRoleService } from "@/server/services/open-role.service";
import { clientRepository } from "@/server/repositories/client.repository";
import { AppError } from "@/server/http/app-error";

/** Shared RSC loader for `/roles/[id]` — one place owns the guard → composite-read → NOT_FOUND mapping. */
export async function loadRoleDetail(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  let role;
  try {
    role = await openRoleService.detail(id);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [matches, dormantMatches, clientRows] = await Promise.all([
    openRoleService.matches(id),
    openRoleService.dormantMatches(id),
    clientRepository.list(),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return { role, matches, dormantMatches, clients, user };
}
