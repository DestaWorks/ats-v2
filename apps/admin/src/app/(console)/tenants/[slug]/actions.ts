"use server";

import { revalidatePath } from "next/cache";
import type { TenantSuspensionReason } from "@destaworks/contracts/validation/tenant";
import { restorePlatformTenant, suspendPlatformTenant } from "../../../../lib/platform-api";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Suspending and restoring, as Server Actions.
 *
 * The console holds no credential: each action forwards the operator's own session to `apps/api`,
 * which re-checks the platform allowlist and writes the audit row against them. Nothing here is
 * authorization — a compromised console can reach exactly what its operator could.
 */
export async function suspendAction(
  slug: string,
  reason: TenantSuspensionReason,
): Promise<ActionResult> {
  const result = await suspendPlatformTenant(slug, reason);
  if (!result.ok) return { ok: false, message: result.failure.message };
  revalidatePath(`/tenants/${slug}`);
  return { ok: true, message: `${result.data.tenant.name} suspended` };
}

export async function restoreAction(slug: string): Promise<ActionResult> {
  const result = await restorePlatformTenant(slug);
  if (!result.ok) return { ok: false, message: result.failure.message };
  revalidatePath(`/tenants/${slug}`);
  return { ok: true, message: `${result.data.tenant.name} restored` };
}
