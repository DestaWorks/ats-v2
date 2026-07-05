import { redirect } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { TrashList } from "./trash-list";

/**
 * Trash view (RSC) — soft-deleted candidates, newest-deleted first. Guards with `getCurrentUser()`
 * (the `(app)` layout also guards — defence in depth), loads the PII-gated payload directly via
 * `candidateService.listTrash(user)` (no self-fetch, mirroring the board / detail pages), and passes
 * `canPurge` down so the client rows can UI-gate the Purge action. The server routes stay
 * authoritative: soft-delete/restore are open to any operator, Purge requires `purgeCandidate`.
 */
export default async function TrashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { items } = await candidateService.listTrash(user);
  const canPurge = hasCapability(user.role, "purgeCandidate");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Trash</h1>
        <p className="text-sm text-gray">
          {items.length} deleted {items.length === 1 ? "candidate" : "candidates"} — restore them,
          or purge permanently.
        </p>
      </header>

      <TrashList items={items} canPurge={canPurge} />
    </div>
  );
}
