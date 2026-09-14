import "reflect-metadata";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import type { Type } from "@nestjs/common";

/**
 * Contract test for the whole `/crm/**` surface: every endpoint is driven through its controller —
 * its own declared guards, then the handler, then the exception filter — against a mocked service,
 * and the resulting `{ status, body }` asserted against the wire contract.
 *
 * Table-driven because the assertions are identical for all 27 routes and the interesting part is
 * the table: verb, path, success status and capability per route, all read back off the decorators
 * rather than restated by hand.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  client: {
    list: vi.fn(),
    create: vi.fn(),
    detail: vi.fn(),
    update: vi.fn(),
    addContact: vi.fn(),
    updateContact: vi.fn(),
    removeContact: vi.fn(),
    addDeal: vi.fn(),
    updateDeal: vi.fn(),
    removeDeal: vi.fn(),
    addBlocker: vi.fn(),
    updateBlocker: vi.fn(),
    removeBlocker: vi.fn(),
    addTask: vi.fn(),
    updateTask: vi.fn(),
    removeTask: vi.fn(),
    addMeeting: vi.fn(),
    removeMeeting: vi.fn(),
  },
  note: { list: vi.fn(), create: vi.fn() },
  analytics: { compare: vi.fn(), healthScore: vi.fn(), revenue: vi.fn() },
  workspace: { generate: vi.fn() },
  portal: { listContactsForClient: vi.fn(), generateLink: vi.fn(), revokeLink: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/client.service", () => ({ clientService: h.client }));
vi.mock("@destaworks/application/client-note.service", () => ({ clientNoteService: h.note }));
vi.mock("@destaworks/application/crm-analytics.service", () => ({
  crmAnalyticsService: h.analytics,
}));
vi.mock("@destaworks/application/crm-ai-workspace.service", () => ({
  crmAiWorkspaceService: h.workspace,
}));
vi.mock("@destaworks/application/client-portal.service", () => ({
  clientPortalService: h.portal,
}));

import { AppError } from "@destaworks/integrations/http/app-error";
import { clientService } from "@destaworks/application/client.service";
import { clientNoteService } from "@destaworks/application/client-note.service";
import { crmAnalyticsService } from "@destaworks/application/crm-analytics.service";
import { crmAiWorkspaceService } from "@destaworks/application/crm-ai-workspace.service";
import { clientPortalService } from "@destaworks/application/client-portal.service";
import type { AuthContext } from "@destaworks/auth/guards";
import {
  guardOutcome,
  handlerOutcome,
  routeSurface,
  type RouteSurface,
} from "../../common/testing/route-parity";
import { CrmAiWorkspaceController } from "./crm-ai-workspace.controller";
import { CrmAnalyticsController } from "./crm-analytics.controller";
import { CrmClientContactsController } from "./client-contacts.controller";
import { CrmClientDealsController } from "./client-deals.controller";
import { CrmClientMeetingsController } from "./client-meetings.controller";
import { CrmClientNotesController } from "./client-notes.controller";
import { CrmClientPortalAdminController } from "./client-portal-admin.controller";
import { CrmClientTasksController } from "./client-tasks.controller";
import { CrmClientsController } from "./clients.controller";

const CLIENT_ID = "cli1";
const CONTACT_ID = "con1";
const DEAL_ID = "deal1";
const BLOCKER_ID = "blk1";
const TASK_ID = "task1";
const MEETING_ID = "mtg1";
const TOKEN_ID = "tok1";

/** A role that holds `viewCrm` and `configureClientPortal` — everything under test. */
const OWNER = "Owner";
/** Leadership, so it holds `viewCrm`, but NOT `configureClientPortal`. */
const DIRECTOR = "Director";
/** Neither. */
const ASSOCIATE = "Associate";

const clients = new CrmClientsController(clientService);
const contacts = new CrmClientContactsController(clientService);
const deals = new CrmClientDealsController(clientService);
const tasks = new CrmClientTasksController(clientService);
const meetings = new CrmClientMeetingsController(clientService);
const notes = new CrmClientNotesController(clientNoteService);
const analytics = new CrmAnalyticsController(crmAnalyticsService);
const workspace = new CrmAiWorkspaceController(crmAiWorkspaceService);
const portal = new CrmClientPortalAdminController(clientPortalService);

const CONTACT_INPUT = { fullName: "Dr. R. Alemu" } as const;
const CONTACT_PATCH = { title: "COO" } as const;
const DEAL_INPUT = { name: "2027 renewal" } as const;
const DEAL_PATCH = { stage: "Signed" } as const;
const BLOCKER_INPUT = { text: "Waiting on redlines" } as const;
const BLOCKER_PATCH = { resolved: true } as const;
const TASK_INPUT = { title: "Chase the MSA" } as const;
const TASK_PATCH = { status: "done" } as const;
const MEETING_INPUT = { type: "weekly" } as const;
const NOTE_INPUT = { text: "Called the COO" } as const;
const WORKSPACE_INPUT = { customPrompt: "Summarise the account" } as const;
const CLIENT_INPUT = { name: "Acme Health" } as const;
const CLIENT_PATCH = { location: "Addis Ababa" } as const;

const REMOVED = { ok: true } as const;

interface EndpointCase {
  readonly name: string;
  readonly controller: Type<object>;
  readonly handler: string;
  readonly surface: RouteSurface;
  /** The application method the handler delegates to, mocked for this test. */
  readonly spy: Mock;
  /** What that method resolves to on the happy path. */
  readonly result: unknown;
  /** The response body that produces, which is `result` unless the handler wraps or replaces it. */
  readonly body: unknown;
  readonly viaController: (user: AuthContext) => Promise<unknown>;
  /** A signed-in role that lacks this route's capability. */
  readonly deniedRole: string;
}

const GUARDS = ["SessionAuthGuard", "CapabilityGuard"];
const RATE_LIMITED_GUARDS = [...GUARDS, "RateLimitGuard"];

/** Everything under `viewCrm` shares one gate; the table only varies verb, path and status. */
function crmSurface(method: string, path: string, status: number): RouteSurface {
  return { method, path, status, capability: "viewCrm", guards: GUARDS };
}

const CASES: EndpointCase[] = [
  {
    name: "GET /crm/clients",
    controller: CrmClientsController,
    handler: "list",
    surface: crmSurface("GET", "/crm/clients", 200),
    spy: h.client.list,
    result: { clients: [{ id: CLIENT_ID, name: "Acme Health" }] },
    body: { clients: [{ id: CLIENT_ID, name: "Acme Health" }] },
    viaController: (user) => clients.list(user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients",
    controller: CrmClientsController,
    handler: "create",
    surface: crmSurface("POST", "/crm/clients", 201),
    spy: h.client.create,
    result: { id: CLIENT_ID, name: "Acme Health" },
    body: { client: { id: CLIENT_ID, name: "Acme Health" } },
    viaController: (user) => clients.create(CLIENT_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "GET /crm/clients/:id",
    controller: CrmClientsController,
    handler: "detail",
    surface: crmSurface("GET", "/crm/clients/:id", 200),
    spy: h.client.detail,
    result: { client: { id: CLIENT_ID }, contacts: [], pipeline: [] },
    body: { client: { id: CLIENT_ID }, contacts: [], pipeline: [] },
    viaController: (user) => clients.detail(CLIENT_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "PATCH /crm/clients/:id",
    controller: CrmClientsController,
    handler: "update",
    surface: crmSurface("PATCH", "/crm/clients/:id", 200),
    spy: h.client.update,
    result: { id: CLIENT_ID, name: "Acme Health" },
    body: { client: { id: CLIENT_ID, name: "Acme Health" } },
    viaController: (user) => clients.update(CLIENT_ID, CLIENT_PATCH, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "GET /crm/compare",
    controller: CrmAnalyticsController,
    handler: "compare",
    surface: crmSurface("GET", "/crm/compare", 200),
    spy: h.analytics.compare,
    result: [{ clientId: CLIENT_ID, name: "Acme Health" }],
    body: { clients: [{ clientId: CLIENT_ID, name: "Acme Health" }] },
    viaController: (user) => analytics.compare(user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "GET /crm/clients/:id/health",
    controller: CrmAnalyticsController,
    handler: "healthScore",
    surface: crmSurface("GET", "/crm/clients/:id/health", 200),
    spy: h.analytics.healthScore,
    result: { score: 72, band: "healthy" },
    body: { score: 72, band: "healthy" },
    viaController: (user) => analytics.healthScore(CLIENT_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "GET /crm/clients/:id/revenue",
    controller: CrmAnalyticsController,
    handler: "revenue",
    surface: crmSurface("GET", "/crm/clients/:id/revenue", 200),
    spy: h.analytics.revenue,
    result: { monthlyRate: 1000, grossMargin: 40 },
    body: { monthlyRate: 1000, grossMargin: 40 },
    viaController: (user) => analytics.revenue(CLIENT_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients/:id/ai-workspace",
    controller: CrmAiWorkspaceController,
    handler: "generate",
    surface: {
      method: "POST",
      path: "/crm/clients/:id/ai-workspace",
      status: 200,
      capability: "viewCrm",
      guards: RATE_LIMITED_GUARDS,
    },
    spy: h.workspace.generate,
    result: { text: "Acme is healthy." },
    body: { text: "Acme is healthy." },
    viaController: (user) => workspace.generate(CLIENT_ID, WORKSPACE_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients/:id/contacts",
    controller: CrmClientContactsController,
    handler: "add",
    surface: crmSurface("POST", "/crm/clients/:id/contacts", 201),
    spy: h.client.addContact,
    result: { id: CONTACT_ID, fullName: "Dr. R. Alemu" },
    body: { contact: { id: CONTACT_ID, fullName: "Dr. R. Alemu" } },
    viaController: (user) => contacts.add(CLIENT_ID, { ...CONTACT_INPUT, role: "unknown" }, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "PATCH /crm/clients/:id/contacts/:contactId",
    controller: CrmClientContactsController,
    handler: "update",
    surface: crmSurface("PATCH", "/crm/clients/:id/contacts/:contactId", 200),
    spy: h.client.updateContact,
    result: { id: CONTACT_ID, title: "COO" },
    body: { contact: { id: CONTACT_ID, title: "COO" } },
    viaController: (user) => contacts.update(CLIENT_ID, CONTACT_ID, CONTACT_PATCH, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "DELETE /crm/clients/:id/contacts/:contactId",
    controller: CrmClientContactsController,
    handler: "remove",
    surface: crmSurface("DELETE", "/crm/clients/:id/contacts/:contactId", 200),
    spy: h.client.removeContact,
    result: REMOVED,
    body: { ok: true, id: CONTACT_ID },
    viaController: (user) => contacts.remove(CLIENT_ID, CONTACT_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients/:id/deals",
    controller: CrmClientDealsController,
    handler: "add",
    surface: crmSurface("POST", "/crm/clients/:id/deals", 201),
    spy: h.client.addDeal,
    result: { id: DEAL_ID, name: "2027 renewal" },
    body: { deal: { id: DEAL_ID, name: "2027 renewal" } },
    viaController: (user) => deals.add(CLIENT_ID, DEAL_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "PATCH /crm/clients/:id/deals/:dealId",
    controller: CrmClientDealsController,
    handler: "update",
    surface: crmSurface("PATCH", "/crm/clients/:id/deals/:dealId", 200),
    spy: h.client.updateDeal,
    result: { id: DEAL_ID, stage: "Signed" },
    body: { deal: { id: DEAL_ID, stage: "Signed" } },
    viaController: (user) => deals.update(CLIENT_ID, DEAL_ID, DEAL_PATCH, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "DELETE /crm/clients/:id/deals/:dealId",
    controller: CrmClientDealsController,
    handler: "remove",
    surface: crmSurface("DELETE", "/crm/clients/:id/deals/:dealId", 200),
    spy: h.client.removeDeal,
    result: REMOVED,
    body: { ok: true, id: DEAL_ID },
    viaController: (user) => deals.remove(CLIENT_ID, DEAL_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients/:id/deals/:dealId/blockers",
    controller: CrmClientDealsController,
    handler: "addBlocker",
    surface: crmSurface("POST", "/crm/clients/:id/deals/:dealId/blockers", 201),
    spy: h.client.addBlocker,
    result: { id: BLOCKER_ID, text: "Waiting on redlines" },
    body: { blocker: { id: BLOCKER_ID, text: "Waiting on redlines" } },
    viaController: (user) => deals.addBlocker(CLIENT_ID, DEAL_ID, BLOCKER_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "PATCH /crm/clients/:id/deals/:dealId/blockers/:blockerId",
    controller: CrmClientDealsController,
    handler: "updateBlocker",
    surface: crmSurface("PATCH", "/crm/clients/:id/deals/:dealId/blockers/:blockerId", 200),
    spy: h.client.updateBlocker,
    result: { id: BLOCKER_ID, resolved: true },
    body: { blocker: { id: BLOCKER_ID, resolved: true } },
    viaController: (user) =>
      deals.updateBlocker(CLIENT_ID, DEAL_ID, BLOCKER_ID, BLOCKER_PATCH, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "DELETE /crm/clients/:id/deals/:dealId/blockers/:blockerId",
    controller: CrmClientDealsController,
    handler: "removeBlocker",
    surface: crmSurface("DELETE", "/crm/clients/:id/deals/:dealId/blockers/:blockerId", 200),
    spy: h.client.removeBlocker,
    result: REMOVED,
    body: { ok: true, id: BLOCKER_ID },
    viaController: (user) => deals.removeBlocker(CLIENT_ID, DEAL_ID, BLOCKER_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients/:id/tasks",
    controller: CrmClientTasksController,
    handler: "add",
    surface: crmSurface("POST", "/crm/clients/:id/tasks", 201),
    spy: h.client.addTask,
    result: { id: TASK_ID, title: "Chase the MSA" },
    body: { task: { id: TASK_ID, title: "Chase the MSA" } },
    viaController: (user) => tasks.add(CLIENT_ID, TASK_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "PATCH /crm/clients/:id/tasks/:taskId",
    controller: CrmClientTasksController,
    handler: "update",
    surface: crmSurface("PATCH", "/crm/clients/:id/tasks/:taskId", 200),
    spy: h.client.updateTask,
    result: { id: TASK_ID, status: "done" },
    body: { task: { id: TASK_ID, status: "done" } },
    viaController: (user) => tasks.update(CLIENT_ID, TASK_ID, TASK_PATCH, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "DELETE /crm/clients/:id/tasks/:taskId",
    controller: CrmClientTasksController,
    handler: "remove",
    surface: crmSurface("DELETE", "/crm/clients/:id/tasks/:taskId", 200),
    spy: h.client.removeTask,
    result: REMOVED,
    body: { ok: true, id: TASK_ID },
    viaController: (user) => tasks.remove(CLIENT_ID, TASK_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients/:id/meetings",
    controller: CrmClientMeetingsController,
    handler: "add",
    surface: crmSurface("POST", "/crm/clients/:id/meetings", 201),
    spy: h.client.addMeeting,
    result: { id: MEETING_ID, type: "weekly" },
    body: { meeting: { id: MEETING_ID, type: "weekly" } },
    viaController: (user) => meetings.add(CLIENT_ID, MEETING_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "DELETE /crm/clients/:id/meetings/:meetingId",
    controller: CrmClientMeetingsController,
    handler: "remove",
    surface: crmSurface("DELETE", "/crm/clients/:id/meetings/:meetingId", 200),
    spy: h.client.removeMeeting,
    result: REMOVED,
    body: { ok: true, id: MEETING_ID },
    viaController: (user) => meetings.remove(CLIENT_ID, MEETING_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "GET /crm/clients/:id/notes",
    controller: CrmClientNotesController,
    handler: "list",
    surface: crmSurface("GET", "/crm/clients/:id/notes", 200),
    spy: h.note.list,
    result: [{ id: "n1", text: "Called the COO" }],
    body: { notes: [{ id: "n1", text: "Called the COO" }] },
    viaController: (user) => notes.list(CLIENT_ID, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /crm/clients/:id/notes",
    controller: CrmClientNotesController,
    handler: "create",
    surface: crmSurface("POST", "/crm/clients/:id/notes", 201),
    spy: h.note.create,
    result: { id: "n1", text: "Called the COO" },
    body: { note: { id: "n1", text: "Called the COO" } },
    viaController: (user) => notes.create(CLIENT_ID, NOTE_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "GET /crm/clients/:id/portal/contacts",
    controller: CrmClientPortalAdminController,
    handler: "listContacts",
    surface: {
      method: "GET",
      path: "/crm/clients/:id/portal/contacts",
      status: 200,
      capability: "configureClientPortal",
      guards: GUARDS,
    },
    spy: h.portal.listContactsForClient,
    result: [{ id: CONTACT_ID, portalEnabled: true }],
    body: { contacts: [{ id: CONTACT_ID, portalEnabled: true }] },
    viaController: (user) => portal.listContacts(CLIENT_ID, user),
    deniedRole: DIRECTOR,
  },
  {
    name: "POST /crm/clients/:id/portal/contacts/:contactId/tokens",
    controller: CrmClientPortalAdminController,
    handler: "generateLink",
    surface: {
      method: "POST",
      path: "/crm/clients/:id/portal/contacts/:contactId/tokens",
      status: 201,
      capability: "configureClientPortal",
      guards: GUARDS,
    },
    spy: h.portal.generateLink,
    result: { url: "https://portal.example/abc", expiresAt: "2026-09-01T00:00:00.000Z" },
    body: { url: "https://portal.example/abc", expiresAt: "2026-09-01T00:00:00.000Z" },
    viaController: (user) => portal.generateLink(CLIENT_ID, CONTACT_ID, user),
    deniedRole: DIRECTOR,
  },
  {
    name: "POST /crm/clients/:id/portal/tokens/:tokenId/revoke",
    controller: CrmClientPortalAdminController,
    handler: "revokeLink",
    surface: {
      method: "POST",
      path: "/crm/clients/:id/portal/tokens/:tokenId/revoke",
      status: 200,
      capability: "configureClientPortal",
      guards: GUARDS,
    },
    spy: h.portal.revokeLink,
    result: REMOVED,
    body: { ok: true, id: TOKEN_ID },
    viaController: (user) => portal.revokeLink(CLIENT_ID, TOKEN_ID, user),
    deniedRole: DIRECTOR,
  },
];

function signIn(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role } };
}

/** Run one case's guards and hand back the user they attached, failing if they refused. */
async function authorize(testCase: EndpointCase): Promise<AuthContext> {
  const request: { headers: Record<string, string>; user?: AuthContext } = { headers: {} };
  expect(await guardOutcome(testCase.controller, testCase.handler, request)).toBeNull();
  if (!request.user) throw new Error(`${testCase.name}: guards attached no user`);
  return request.user;
}

beforeEach(() => {
  h.session = null;
  for (const group of [h.client, h.note, h.analytics, h.workspace, h.portal]) {
    for (const spy of Object.values(group)) spy.mockReset();
  }
});

describe.each(CASES)("$name", (testCase) => {
  it("is registered at the verb, path, status and capability the endpoint declares", () => {
    expect(routeSurface(testCase.controller, testCase.handler)).toEqual(testCase.surface);
  });

  it("answers the contract body at the declared status", async () => {
    signIn(OWNER);
    testCase.spy.mockResolvedValue(testCase.result);
    const user = await authorize(testCase);
    const fromController = await handlerOutcome(testCase.controller, testCase.handler, () =>
      testCase.viaController(user),
    );

    expect(fromController.status).toBe(testCase.surface.status);
    expect(fromController.body).toEqual(testCase.body);
  });

  it("maps a service failure to a 404 envelope", async () => {
    signIn(OWNER);
    const reject = (): never => {
      throw new AppError("NOT_FOUND", "Client not found");
    };
    testCase.spy.mockImplementation(reject);

    const user = await authorize(testCase);
    const fromController = await handlerOutcome(testCase.controller, testCase.handler, () =>
      testCase.viaController(user),
    );

    expect(fromController.status).toBe(404);
    expect(fromController.body).toEqual({
      error: { code: "NOT_FOUND", message: "Client not found" },
    });
  });

  it("refuses an unauthenticated caller, without touching the service", async () => {
    const fromController = await guardOutcome(testCase.controller, testCase.handler, {
      headers: {},
    });

    expect(fromController?.status).toBe(401);
    expect(fromController?.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Sign in required" },
    });
    expect(testCase.spy).not.toHaveBeenCalled();
  });

  it("refuses a role without the capability", async () => {
    signIn(testCase.deniedRole);
    const fromController = await guardOutcome(testCase.controller, testCase.handler, {
      headers: {},
    });

    expect(fromController?.status).toBe(403);
    expect(fromController?.body).toEqual({
      error: { code: "FORBIDDEN", message: "You don't have permission to do that" },
    });
    expect(testCase.spy).not.toHaveBeenCalled();
  });
});
