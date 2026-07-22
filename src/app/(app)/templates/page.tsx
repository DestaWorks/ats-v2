import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { hasCapability } from "@/lib/constants";
import { clientRepository } from "@/server/repositories/client.repository";
import { userPreferencesService } from "@/server/services/user-preferences.service";
import { TemplatesWorkspace } from "./templates-workspace";

/**
 * Templates (RSC, Wave 4.1) — outreach/workflow template library, ported from legacy
 * `index.html:3637-3900`. Open to any signed-in user (matches Pipeline/Candidates/Sourcing), no
 * capability gate at the page level — Template Performance (leadership-only) self-gates its own
 * trigger + route. `TEMPLATES`/`TEMPLATE_CATEGORIES` are static constants imported directly by the
 * client component (no fetch needed); the server supplies the client list + this user's saved
 * signature/sticky note.
 */
export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [clientRows, preferences] = await Promise.all([
    clientRepository.list(),
    userPreferencesService.getMine(user),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Outreach & Workflow Templates</h1>
          <p className="text-sm text-gray">
            Select a template, pick a candidate or sourced lead, auto-fill, and send.
          </p>
        </div>
      </header>

      <TemplatesWorkspace
        clients={clients}
        recruiterName={user.name}
        canViewPerformance={hasCapability(user.role, "viewAnalytics")}
        initialSignature={preferences.emailSignature}
      />
    </div>
  );
}
