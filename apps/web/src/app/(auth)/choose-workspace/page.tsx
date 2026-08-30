import { redirect } from "next/navigation";
import { getCurrentUser, getSignedInIdentity } from "@destaworks/auth/guards";
import type { GetTenantsResponse } from "@destaworks/contracts/validation/tenant";
import { apiGet } from "@/lib/api/server";
import { ChooseWorkspace } from "./choose-workspace";

/**
 * Which workspace am I working in? (Phase 6.5)
 *
 * Reached when a session exists but no tenant resolves — a person in two workspaces whose request
 * carries no claim. `resolveTenantContext` answers `ambiguous` rather than picking one, because
 * picking one silently would let the same request carry Owner authority in A and Associate
 * authority in B depending on membership order. That refusal is correct and this screen is its
 * missing other half: without it the app shell cannot render, so the switcher inside it cannot be
 * reached, and the person is simply stuck.
 *
 * Identity only, deliberately: `getCurrentUser()` returns null here by definition.
 */
export default async function ChooseWorkspacePage() {
  const identity = await getSignedInIdentity();
  if (!identity) redirect("/sign-in");

  // Already resolvable — nothing to choose.
  if (await getCurrentUser()) redirect("/dashboard");

  const { tenants } = await apiGet<GetTenantsResponse>("/tenants");

  return <ChooseWorkspace tenants={tenants} name={identity.name} />;
}
