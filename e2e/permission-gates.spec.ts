import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { createUser } from "./fixtures/api";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";
const WEB_BASE_URL = "http://localhost:3007";

/** Every capability gate, from the denied side: an Associate holds none of them. */

const GATES: readonly {
  capability: string;
  method: "get" | "post" | "patch" | "delete";
  path: string;
}[] = [
  { capability: "viewCrm", method: "get", path: "/crm/clients" },
  { capability: "viewReports", method: "get", path: "/reports/filter-options" },
  { capability: "viewAudit", method: "get", path: "/activity/actor-options" },
  { capability: "manageAiSettings", method: "get", path: "/admin/ai/usage" },
  { capability: "manageUsers", method: "post", path: "/admin/users" },
  { capability: "manageRoles", method: "patch", path: "/admin/users/does-not-exist/role" },
  { capability: "bulkImport", method: "post", path: "/migration/prepare" },
  { capability: "viewAnalytics", method: "get", path: "/crm/compare" },
  { capability: "viewClientDiscovery", method: "get", path: "/saved-icps" },
  { capability: "manageAccessRequests", method: "get", path: "/admin/access-requests" },
  { capability: "configureClientPortal", method: "get", path: "/admin/portal/requests" },
  { capability: "viewCredentials", method: "get", path: "/credentials/overview" },
  { capability: "purgeCandidate", method: "post", path: "/candidates/does-not-exist/purge" },
  { capability: "deleteOpenRole", method: "delete", path: "/roles/does-not-exist" },
];

let associate: APIRequestContext;

test.beforeAll(async () => {
  const ownerContext = await playwrightRequest.newContext({
    storageState: "e2e/.auth/owner.json",
  });
  const stamp = Date.now();
  const email = `e2e-gates-${stamp}@example.com`;
  const password = "E2eGates123!";
  await createUser(ownerContext, `E2E Gates ${stamp}`, email, "Associate", password);
  await ownerContext.dispose();

  associate = await playwrightRequest.newContext();
  const signIn = await associate.post(`${WEB_BASE_URL}/api/auth/sign-in/email`, {
    data: { email, password },
    headers: { origin: WEB_BASE_URL },
  });
  expect(signIn.ok(), "the Associate fixture should be able to sign in").toBeTruthy();

  const switched = await associate.post(`${API_BASE_URL}/tenants/switch`, {
    data: { tenant: "destaworks" },
  });
  expect(switched.ok(), "the Associate should be able to enter the workspace").toBeTruthy();

  const whoami = await associate.get(`${API_BASE_URL}/tenants`);
  expect(whoami.status(), "the Associate should reach a non-gated endpoint").toBe(200);
});

test.afterAll(async () => {
  await associate?.dispose();
});

for (const gate of GATES) {
  test(`refuses ${gate.capability} to a role that does not hold it`, async () => {
    const response = await associate[gate.method](`${API_BASE_URL}${gate.path}`, { data: {} });

    expect(
      response.status(),
      `${gate.method.toUpperCase()} ${gate.path} should be forbidden without ${gate.capability}`,
    ).toBe(403);
  });
}
