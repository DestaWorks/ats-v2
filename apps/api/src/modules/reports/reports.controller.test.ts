import "reflect-metadata";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * Contract parity for `GET /api/reports/*`: the Nest controller answers the same status and the
 * same body as the Next.js route it replaces, for the same input — including the two denials
 * (401 signed out, 403 without `viewReports`) and the 422 envelope on a bad filter.
 *
 * The reports are exercised through a real HTTP server, so the class-level `@RequireCapability`,
 * the `ZodValidationPipe` on the filter bar and the exception filter's envelope are all in the
 * path, exactly as they will be in production.
 */

// `server-only` throws outside an RSC build; the auth guard's module graph reaches it.
vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  executiveSummary: vi.fn(),
  pipelineFunnel: vi.fn(),
  perClientFunnel: vi.fn(),
  clientPortfolio: vi.fn(),
  clientCapacity: vi.fn(),
  teamPerformance: vi.fn(),
  sourceRoi: vi.fn(),
  timeAnalysis: vi.fn(),
  compliance: vi.fn(),
  massJourney: vi.fn(),
  trends: vi.fn(),
  candidatesCsv: vi.fn(),
  requestExport: vi.fn(),
  getExport: vi.fn(),
  failExport: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));

import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { provideFakeService, startTestApi, type TestApi } from "../../common/testing/nest-app";
import { ReportsController } from "./reports.controller";
import {
  CLIENT_REPORTS_SERVICE,
  EXPORT_SERVICE,
  MASS_JOURNEY_REPORT,
  PIPELINE_REPORTS_SERVICE,
  REPORT_EXPORT_SERVICE,
  TEAM_REPORTS_SERVICE,
  TIME_REPORTS_SERVICE,
  TRENDS_REPORT,
} from "./reports.tokens";
import { JOB_QUEUE } from "../jobs/jobs.tokens";

interface Envelope {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

const OWNER = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
const ASSOCIATE = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };

let api: TestApi;

beforeAll(async () => {
  installNestRequestContext();
  api = await startTestApi({
    controllers: [ReportsController],
    providers: [
      provideFakeService(PIPELINE_REPORTS_SERVICE, {
        executiveSummary: h.executiveSummary,
        pipelineFunnel: h.pipelineFunnel,
      }),
      provideFakeService(CLIENT_REPORTS_SERVICE, {
        perClientFunnel: h.perClientFunnel,
        clientPortfolio: h.clientPortfolio,
        clientCapacity: h.clientCapacity,
      }),
      provideFakeService(TEAM_REPORTS_SERVICE, {
        teamPerformance: h.teamPerformance,
        sourceRoi: h.sourceRoi,
      }),
      provideFakeService(TIME_REPORTS_SERVICE, {
        timeAnalysis: h.timeAnalysis,
        compliance: h.compliance,
      }),
      provideFakeService(MASS_JOURNEY_REPORT, { massJourney: h.massJourney }),
      provideFakeService(TRENDS_REPORT, { trends: h.trends }),
      provideFakeService(EXPORT_SERVICE, { candidatesCsv: h.candidatesCsv }),
      provideFakeService(REPORT_EXPORT_SERVICE, {
        request: h.requestExport,
        get: h.getExport,
        fail: h.failExport,
      }),
      provideFakeService(JOB_QUEUE, { enqueue: h.enqueue }),
    ],
  });
});

afterAll(() => api.close());

beforeEach(() => {
  h.session = null;
  for (const value of Object.values(h)) if (vi.isMockFunction(value)) value.mockReset();
});

/**
 * The nine filtered reports, the two unfiltered ones, and the service call each delegates to.
 * A table because the assertions are the same for every one of them — the eleven near-identical
 * route files this replaces are exactly what the table exists to stop being written again.
 */
const REPORTS = [
  { path: "executive", call: h.executiveSummary, filtered: true },
  { path: "pipeline-funnel", call: h.pipelineFunnel, filtered: true },
  { path: "client-funnel", call: h.perClientFunnel, filtered: true },
  { path: "client-portfolio", call: h.clientPortfolio, filtered: true },
  { path: "client-capacity", call: h.clientCapacity, filtered: false },
  { path: "team-performance", call: h.teamPerformance, filtered: true },
  { path: "source-roi", call: h.sourceRoi, filtered: true },
  { path: "time-analysis", call: h.timeAnalysis, filtered: true },
  { path: "compliance", call: h.compliance, filtered: true },
  { path: "mass-journey", call: h.massJourney, filtered: true, tenanted: true },
  { path: "trends", call: h.trends, filtered: false, tenanted: true },
] as const;

describe.each(REPORTS)("GET /reports/$path", ({ path, call, filtered }) => {
  it("401 when signed out, and never reaches the service", async () => {
    const res = await api.fetch(`/reports/${path}`);
    expect(res.status).toBe(401);
    expect(((await res.json()) as Envelope).error.code).toBe("UNAUTHORIZED");
    expect(call).not.toHaveBeenCalled();
  });

  it("403 for a role without viewReports, and never reaches the service", async () => {
    h.session = ASSOCIATE;
    const res = await api.fetch(`/reports/${path}`);
    expect(res.status).toBe(403);
    expect(((await res.json()) as Envelope).error.code).toBe("FORBIDDEN");
    expect(call).not.toHaveBeenCalled();
  });

  it("200 for Owner, returning the service's DTO verbatim", async () => {
    h.session = OWNER;
    call.mockResolvedValue({ marker: path });
    const res = await api.fetch(`/reports/${path}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ marker: path });
  });

  it(filtered ? "passes the parsed filter bar through" : "takes no filters", async () => {
    h.session = OWNER;
    call.mockResolvedValue({});
    await api.fetch(`/reports/${path}?clientId=c1&source=LinkedIn&addedFrom=2026-01-02`);
    // The resolved context comes FIRST now — every report scopes before it filters.
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
      ...(filtered
        ? [{ clientId: "c1", source: "LinkedIn", addedFrom: new Date("2026-01-02") }]
        : []),
    );
  });
});

describe("GET /reports/* filter validation", () => {
  it("422 with the BAD_REQUEST envelope and a dotted issue path", async () => {
    h.session = OWNER;
    const res = await api.fetch("/reports/executive?addedFrom=not-a-date");
    expect(res.status).toBe(422);
    const body = (await res.json()) as Envelope;
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.issues?.[0]?.path).toBe("addedFrom");
    expect(h.executiveSummary).not.toHaveBeenCalled();
  });

  it("ignores query params the filter contract does not declare", async () => {
    h.session = OWNER;
    h.executiveSummary.mockResolvedValue({});
    await api.fetch("/reports/executive?clientId=c1&sneaky=1");
    expect(h.executiveSummary).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.any(String) }),
      { clientId: "c1" },
    );
  });
});

describe("GET /reports/export", () => {
  it("401 when signed out", async () => {
    const res = await api.fetch("/reports/export");
    expect(res.status).toBe(401);
    expect(h.candidatesCsv).not.toHaveBeenCalled();
  });

  it("403 for a role without viewReports", async () => {
    h.session = ASSOCIATE;
    const res = await api.fetch("/reports/export");
    expect(res.status).toBe(403);
    expect(h.candidatesCsv).not.toHaveBeenCalled();
  });

  it("answers text/csv as a named download, with the CSV body unwrapped", async () => {
    h.session = OWNER;
    h.candidatesCsv.mockResolvedValue("name,email\nJane,jane@example.com\n");
    const res = await api.fetch("/reports/export?clientId=c1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="candidates-report.csv"',
    );
    expect(await res.text()).toBe("name,email\nJane,jane@example.com\n");
    expect(h.candidatesCsv).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.any(String) }),
      { clientId: "c1" },
    );
  });

  it("still renders the JSON error envelope on failure, not a CSV file", async () => {
    h.session = ASSOCIATE;
    const res = await api.fetch("/reports/export");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(((await res.json()) as Envelope).error.code).toBe("FORBIDDEN");
  });
});

/**
 * The asynchronous export (Phase 5): the same cohort, built off the request path. These assert
 * the two things the flow depends on — that the enqueued payload names the row that was just
 * created, and that a failed enqueue does not leave that row waiting for a job nobody queued.
 */
describe("POST /reports/export/jobs", () => {
  it("401 when signed out, and never enqueues", async () => {
    const res = await api.fetch("/reports/export/jobs", { method: "POST" });
    expect(res.status).toBe(401);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("403 for a role without viewReports, and never enqueues", async () => {
    h.session = ASSOCIATE;
    const res = await api.fetch("/reports/export/jobs", { method: "POST" });
    expect(res.status).toBe(403);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("records the request against the caller and enqueues that export's id", async () => {
    h.session = OWNER;
    h.requestExport.mockResolvedValue({ id: "exp1" });
    h.getExport.mockResolvedValue({ id: "exp1", status: "pending" });
    const res = await api.fetch("/reports/export/jobs?clientId=c1", { method: "POST" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "exp1", status: "pending" });
    expect(h.requestExport).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
      "u1",
      { clientId: "c1" },
    );
    expect(h.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: "reports.export.candidates" }),
      { exportId: "exp1", tenantId: "t1", filters: { clientId: "c1" } },
    );
  });

  it("marks the export failed when the enqueue itself fails", async () => {
    h.session = OWNER;
    h.requestExport.mockResolvedValue({ id: "exp2" });
    h.enqueue.mockRejectedValue(new Error("queue down"));
    const res = await api.fetch("/reports/export/jobs", { method: "POST" });
    expect(res.status).toBe(500);
    expect(h.failExport).toHaveBeenCalledWith("exp2", "t1", "INTERNAL");
    expect(h.getExport).not.toHaveBeenCalled();
  });
});

describe("GET /reports/export/jobs/:id", () => {
  it("401 when signed out, and never reads the export", async () => {
    const res = await api.fetch("/reports/export/jobs/exp1");
    expect(res.status).toBe(401);
    expect(h.getExport).not.toHaveBeenCalled();
  });

  it("reads the export as the caller, so ownership can be enforced below", async () => {
    h.session = OWNER;
    h.getExport.mockResolvedValue({ id: "exp1", status: "ready", downloadUrl: "https://s/x" });
    const res = await api.fetch("/reports/export/jobs/exp1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "exp1", status: "ready", downloadUrl: "https://s/x" });
    expect(h.getExport).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
      "exp1",
      "u1",
    );
  });
});
