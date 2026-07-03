"use server";

import { accessRequestSchema } from "@/lib/validation/auth";
import { accessRequestService } from "@/server/services/access-request.service";

/**
 * Server Action: submit an access request. Thin — validates with the shared Zod schema,
 * then delegates to the service (no business logic here).
 */
export async function submitAccessRequest(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = accessRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }
  await accessRequestService.submit(parsed.data);
  return { ok: true };
}
