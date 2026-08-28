import "reflect-metadata";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * Contract parity for `/api/briefs/*` and `/api/targets/suggest`: the `viewReports` denials, the
 * per-bucket rate limits, the `null` body the two saved-brief GETs may legitimately answer, and
 * the VIEWER-timezone resolution of "today" — pinned at a boundary hour, where a server-local
 * answer and a viewer-local answer are different days.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getDaily: vi.fn(),
  generateDaily: vi.fn(),
  saveDaily: vi.fn(),
  getWeekly: vi.fn(),
  generateWeekly: vi.fn(),
  saveWeekly: vi.fn(),
  generatePatterns: vi.fn(),
  suggestTargets: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/integrations/http/rate-limit", () => ({ checkRateLimit: h.checkRateLimit }));

import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { provideFakeService, startTestApi, type TestApi } from "../../common/testing/nest-app";
import { BriefsController } from "./briefs.controller";
import { BRIEF_SERVICE } from "./briefs.tokens";
import { TargetsController } from "./targets.controller";

interface Envelope {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

const OWNER = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
const ASSOCIATE = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };

/** A complete `dailyBriefAiSchema` draft — the save endpoint's schema is `.strict()` and total. */
const DAILY_DRAFT = {
  headline: "All clear",
  exceptions: [],
  yesterdayCheck: [],
  clientCards: [],
  perAssociate: [],
  teamPulse: "Steady",
};

/** A complete `weeklyBriefAiSchema` draft. */
const WEEKLY_DRAFT = {
  headline: "Solid week",
  kpiNarrative: "Outreach up, screens flat",
  clientCards: [],
  perAssociate: [],
  lastWeekCheck: [],
  decisions: [],
  highlights: "Two placements",
  blockers: "None",
};

let api: TestApi;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  api.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  installNestRequestContext();
  api = await startTestApi({
    controllers: [BriefsController, TargetsController],
    providers: [
      provideFakeService(BRIEF_SERVICE, {
        getDaily: h.getDaily,
        generateDaily: h.generateDaily,
        saveDaily: h.saveDaily,
        getWeekly: h.getWeekly,
        generateWeekly: h.generateWeekly,
        saveWeekly: h.saveWeekly,
        generatePatterns: h.generatePatterns,
        suggestTargets: h.suggestTargets,
      }),
    ],
  });
});

afterAll(() => api.close());

beforeEach(() => {
  h.session = null;
  for (const value of Object.values(h)) if (vi.isMockFunction(value)) value.mockReset();
});

/** Every endpoint in both controllers, with the request that exercises it. */
const ENDPOINTS = [
  { method: "GET", path: "/briefs/daily", call: h.getDaily, body: undefined },
  {
    method: "POST",
    path: "/briefs/daily/generate",
    call: h.generateDaily,
    body: { date: "2026-08-25", tz: 0 },
  },
  {
    method: "POST",
    path: "/briefs/daily/save",
    call: h.saveDaily,
    body: { ...DAILY_DRAFT, date: "2026-08-25" },
  },
  { method: "GET", path: "/briefs/weekly", call: h.getWeekly, body: undefined },
  {
    method: "POST",
    path: "/briefs/weekly/generate",
    call: h.generateWeekly,
    body: { weekStart: "2026-08-24", tz: 0 },
  },
  {
    method: "POST",
    path: "/briefs/weekly/save",
    call: h.saveWeekly,
    body: { ...WEEKLY_DRAFT, weekStart: "2026-08-24" },
  },
  {
    method: "POST",
    path: "/briefs/weekly/patterns",
    call: h.generatePatterns,
    body: { weekStart: "2026-08-24", tz: 0 },
  },
  {
    method: "POST",
    path: "/targets/suggest",
    call: h.suggestTargets,
    body: { userId: "u9", date: "2026-08-25" },
  },
] as const;

const send = (endpoint: (typeof ENDPOINTS)[number]) =>
  endpoint.method === "GET" ? api.fetch(endpoint.path) : post(endpoint.path, endpoint.body);

describe.each(ENDPOINTS)("$method $path", (endpoint) => {
  const { call } = endpoint;

  it("401 when signed out, and never reaches the service", async () => {
    const res = await send(endpoint);
    expect(res.status).toBe(401);
    expect(((await res.json()) as Envelope).error.code).toBe("UNAUTHORIZED");
    expect(call).not.toHaveBeenCalled();
  });

  it("403 for a role without viewReports, and never reaches the service", async () => {
    h.session = ASSOCIATE;
    const res = await send(endpoint);
    expect(res.status).toBe(403);
    expect(((await res.json()) as Envelope).error.code).toBe("FORBIDDEN");
    expect(call).not.toHaveBeenCalled();
  });

  it("200 for Owner — never Nest's default 201 for a POST", async () => {
    h.session = OWNER;
    call.mockResolvedValue({ ok: 1 });
    const res = await send(endpoint);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });
});

describe("rate limiting mirrors the routes' buckets", () => {
  it.each([
    ["/briefs/daily/generate", { date: "2026-08-25", tz: 0 }, "briefs-daily-generate", 20],
    ["/briefs/weekly/generate", { weekStart: "2026-08-24", tz: 0 }, "briefs-weekly-generate", 10],
    ["/briefs/weekly/patterns", { weekStart: "2026-08-24", tz: 0 }, "briefs-weekly-patterns", 10],
    ["/targets/suggest", { userId: "u9", date: "2026-08-25" }, "targets-suggest", 20],
  ])("%s is metered per user as %s", async (path, body, bucket, limit) => {
    h.session = OWNER;
    await post(path, body);
    expect(h.checkRateLimit).toHaveBeenCalledWith(`${bucket}:u1`, { limit, windowMs: 60_000 });
  });

  it("leaves the save endpoints unmetered, as the routes do", async () => {
    h.session = OWNER;
    await post("/briefs/daily/save", { ...DAILY_DRAFT, date: "2026-08-25" });
    expect(h.checkRateLimit).not.toHaveBeenCalled();
  });
});

describe("GET /briefs/daily — the nullable body", () => {
  it("answers a parseable `null`, not an empty response, when no brief is saved", async () => {
    h.session = OWNER;
    h.getDaily.mockResolvedValue(null);
    const res = await api.fetch("/briefs/daily?date=2026-08-25");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("null");
  });

  it("returns the saved brief verbatim", async () => {
    h.session = OWNER;
    h.getDaily.mockResolvedValue(DAILY_DRAFT);
    const res = await api.fetch("/briefs/daily?date=2026-08-25");
    expect(await res.json()).toEqual(DAILY_DRAFT);
    expect(h.getDaily).toHaveBeenCalledWith("2026-08-25");
  });

  it("ignores a malformed date and falls back to the viewer's day", async () => {
    h.session = OWNER;
    h.getDaily.mockResolvedValue(null);
    await api.fetch("/briefs/daily?date=25-08-2026");
    expect(h.getDaily).not.toHaveBeenCalledWith("25-08-2026");
  });
});

/**
 * The boundary case Phase 0.6 exists for. At 22:30 UTC a viewer at UTC+3 (`app-tz: -180`, the
 * `Date.getTimezoneOffset()` sign convention) is already on the 26th; the host is still on the
 * 25th. Serving the host's day would hand that viewer YESTERDAY's brief for three hours a day.
 */
describe("today resolves in the VIEWER's timezone, not the host's", () => {
  const BOUNDARY = new Date("2026-08-25T22:30:00.000Z");

  beforeEach(() => {
    h.session = OWNER;
    h.getDaily.mockResolvedValue(null);
    h.getWeekly.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(BOUNDARY);
  });

  afterAll(() => vi.useRealTimers());

  it("gives a UTC+3 viewer the NEXT day", async () => {
    await api.fetch("/briefs/daily", { headers: { cookie: "app-tz=-180" } });
    expect(h.getDaily).toHaveBeenCalledWith("2026-08-26");
    vi.useRealTimers();
  });

  it("gives a UTC-5 viewer the SAME day the host is on", async () => {
    await api.fetch("/briefs/daily", { headers: { cookie: "app-tz=300" } });
    expect(h.getDaily).toHaveBeenCalledWith("2026-08-25");
    vi.useRealTimers();
  });

  it("falls back to UTC when the cookie is absent, exactly as the route does", async () => {
    await api.fetch("/briefs/daily");
    expect(h.getDaily).toHaveBeenCalledWith("2026-08-25");
    vi.useRealTimers();
  });

  it("anchors the weekly brief on the Monday of the VIEWER's week", async () => {
    await api.fetch("/briefs/weekly", { headers: { cookie: "app-tz=-180" } });
    expect(h.getWeekly).toHaveBeenCalledWith("2026-08-24");
    vi.useRealTimers();
  });
});

describe("request validation", () => {
  it("422 with the BAD_REQUEST envelope on a bad date key", async () => {
    h.session = OWNER;
    const res = await post("/briefs/daily/generate", { date: "25-08-2026", tz: 0 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as Envelope;
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.issues?.map((i) => i.path)).toContain("date");
    expect(h.generateDaily).not.toHaveBeenCalled();
  });

  it("splits the generate body into the window and the manual inputs the service expects", async () => {
    h.session = OWNER;
    h.generateDaily.mockResolvedValue(DAILY_DRAFT);
    await post("/briefs/daily/generate", {
      date: "2026-08-25",
      tz: -180,
      priorityClientId: "c1",
      shiftA: "A",
    });
    expect(h.generateDaily).toHaveBeenCalledWith(
      { date: "2026-08-25", tz: -180 },
      { priorityClientId: "c1", shiftA: "A", shiftB: null, watchItems: null },
    );
  });

  it("rejects an unknown key on a strict schema", async () => {
    h.session = OWNER;
    const res = await post("/targets/suggest", {
      userId: "u9",
      date: "2026-08-25",
      escalate: true,
    });
    expect(res.status).toBe(422);
    expect(h.suggestTargets).not.toHaveBeenCalled();
  });
});
