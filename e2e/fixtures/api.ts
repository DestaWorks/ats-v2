import type { APIRequestContext } from "@playwright/test";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Creates a source lead directly against `apps/api`, bypassing the UI, so
 * `lead-promotion.spec.ts` exercises only the promote interaction rather than lead creation too.
 * Rides the signed-in session cookie already in `request`'s context (the `chromium` project's
 * `storageState`, set up by `e2e/fixtures/auth.setup.ts`).
 *
 * A freshly-created lead starts at the `Sourced` status, and `canPromote()`
 * (`packages/domain/src/rules/lead-lifecycle.ts`) allows promotion from any non-`Promoted`
 * status — so no outreach/response steps are needed to make it promotable.
 */
export async function createLead(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/leads`, { data: { name } });
  if (!response.ok()) {
    throw new Error(`Failed to create fixture lead: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { lead: { id: string } };
  return body.lead.id;
}

/** Shared helper: POST to `apps/api`, throw with a readable message on failure, return the body. */
async function post(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await request.post(`${API_BASE_URL}${path}`, { data });
  if (!response.ok()) {
    throw new Error(`POST ${path} failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Fixture-only: a CRM client, for specs that need one to exist before exercising a nested flow
 *  (contacts/tasks/meetings/deals, or a role's required `clientId`). Only `name` is required. */
export async function createClient(request: APIRequestContext, name: string): Promise<string> {
  const body = await post(request, "/crm/clients", { name });
  return (body["client"] as { id: string }).id;
}

/** Fixture-only: a Client Discovery prospect. Only `practiceName` is required; the service forces
 *  status "Fresh Lead" and source "Manual" regardless of what's sent. */
export async function createProspect(
  request: APIRequestContext,
  practiceName: string,
): Promise<string> {
  const body = await post(request, "/prospects", { practiceName });
  return (body["prospect"] as { id: string }).id;
}

/** Fixture-only: a candidate, bypassing the `/candidates/new` UI form (already covered by
 *  `candidate-pipeline.spec.ts`) — for specs that just need SOME candidate to act on. Defaults to
 *  `Operations` (needs no credential/license); pass `"Clinical"` for specs exercising the License
 *  tab, which `trackFieldVisibility` hides entirely for Operations. */
export async function createCandidate(
  request: APIRequestContext,
  name: string,
  track: "Operations" | "Clinical" = "Operations",
): Promise<string> {
  const body = await post(request, "/candidates", { name, track });
  return (body["candidate"] as { id: string }).id;
}

/** Fixture-only: soft-deletes a candidate (`DELETE /candidates/:id`), for specs exercising the
 *  Trash restore flow — which needs a candidate already in that state to act on. */
export async function deleteCandidate(
  request: APIRequestContext,
  candidateId: string,
): Promise<void> {
  const response = await request.delete(`${API_BASE_URL}/candidates/${candidateId}`);
  if (!response.ok()) {
    throw new Error(
      `Failed to delete fixture candidate: ${response.status()} ${await response.text()}`,
    );
  }
}

/** Fixture-only: an open role. Requires a `clientId` — create a client first. */
export async function createRole(
  request: APIRequestContext,
  clientId: string,
  title: string,
): Promise<string> {
  const body = await post(request, "/roles", { clientId, title });
  return (body["role"] as { id: string }).id;
}
