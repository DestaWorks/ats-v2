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
export async function createLead(
  request: APIRequestContext,
  name: string,
  clientId?: string,
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/leads`, {
    data: { name, ...(clientId ? { clientId } : {}) },
  });
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
 *  tab, which `trackFieldVisibility` hides entirely for Operations. `email` is only needed by specs
 *  that go on to move the candidate into a stage gated on contact info (e.g. `QUALIFIED_PRESCREEN`
 *  for an Operations candidate — see `stage-gates.ts`). */
export async function createCandidate(
  request: APIRequestContext,
  name: string,
  track: "Operations" | "Clinical" = "Operations",
  email?: string,
): Promise<string> {
  const body = await post(request, "/candidates", { name, track, ...(email ? { email } : {}) });
  return (body["candidate"] as { id: string }).id;
}

/** Fixture-only: verifies a candidate's license via the same `POST /candidates/:id/verify-license`
 *  the License tab's form uses — for specs that need a candidate already in a given license state
 *  (e.g. License Verify's Expiry Timeline, which only lists `Active` candidates with a known
 *  expiry) without re-exercising the verify form `candidate-detail.spec.ts` already covers. */
export async function verifyLicense(
  request: APIRequestContext,
  candidateId: string,
  licenseStatus: string,
  licenseExpiry?: string,
): Promise<void> {
  await post(request, `/candidates/${candidateId}/verify-license`, {
    licenseStatus,
    ...(licenseExpiry ? { licenseExpiry } : {}),
  });
}

/** Fixture-only: moves a candidate to `toStatus` via the same server-authoritative
 *  `POST /candidates/:id/move` the pipeline board uses — for specs that need a candidate already
 *  sitting in a particular stage (e.g. Screening's `SCREENING_ELIGIBLE_STATUSES`) without
 *  re-exercising the drag/select move interaction `candidate-pipeline.spec.ts` already covers. */
export async function moveCandidateStatus(
  request: APIRequestContext,
  candidateId: string,
  toStatus: string,
): Promise<void> {
  await post(request, `/candidates/${candidateId}/move`, { toStatus });
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

/** Fixture-only: an admin-created account with a known plaintext password (`POST /admin/users`
 *  accepts an explicit `password`, bypassing the auto-generate-and-display-once banner
 *  `admin-user.spec.ts` already covers), for specs that need to sign in as a non-Owner role. Rides
 *  the Owner session already in `request`'s context — `manageUsers` is Owner/Admin-only. */
export async function createUser(
  request: APIRequestContext,
  name: string,
  email: string,
  role: string,
  password: string,
): Promise<void> {
  await post(request, "/admin/users", { name, email, role, password });
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

/** Fixture-only: a CRM client contact, for specs that need one to exist before generating a
 *  Client Portal access link. Only `fullName` is required. */
export async function createClientContact(
  request: APIRequestContext,
  clientId: string,
  fullName: string,
): Promise<string> {
  const body = await post(request, `/crm/clients/${clientId}/contacts`, { fullName });
  return (body["contact"] as { id: string }).id;
}

/** Fixture-only: a Client Portal access link for an existing contact
 *  (`client-portal.service.ts#generateLink`) — returns the RAW one-time token, which the spec
 *  exchanges itself by visiting `/portal/access?token=...` (the real link a client would click).
 *  Rides the Owner session; generating a portal link is a staff-side CRM action. */
export async function generatePortalLink(
  request: APIRequestContext,
  clientId: string,
  contactId: string,
): Promise<string> {
  const body = await post(
    request,
    `/crm/clients/${clientId}/portal/contacts/${contactId}/tokens`,
    {},
  );
  return body["token"] as string;
}
