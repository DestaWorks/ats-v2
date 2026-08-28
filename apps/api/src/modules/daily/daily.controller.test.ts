import "reflect-metadata";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * Contract parity for `/api/daily/*`: the 401 every endpoint owes a signed-out caller, the
 * created-vs-acknowledged status codes, the 422 envelope from the contract schemas, and the
 * VIEWER-timezone resolution of "today" — pinned at a boundary hour, where the host's day and
 * the viewer's day are different dates.
 *
 * The three leadership-only endpoints (targets, manager feedback, team breakdown) are gated in
 * `dailyService`, not in the controller, so their 403 is the service's to prove; what is asserted
 * here is that the controller hands the service the session user it needs to make that call.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  logView: vi.fn(),
  submitLog: vi.fn(),
  overview: vi.fn(),
  saveActuals: vi.fn(),
  setTarget: vi.fn(),
  addFeedback: vi.fn(),
  recap: vi.fn(),
  teamBreakdown: vi.fn(),
  addEntry: vi.fn(),
  addGoal: vi.fn(),
  setGoalDone: vi.fn(),
}));

vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));

import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { provideFakeService, startTestApi, type TestApi } from "../../common/testing/nest-app";
import { DailyController } from "./daily.controller";
import { DAILY_SERVICE } from "./daily.tokens";

interface Envelope {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

const USER = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };

let api: TestApi;

const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  api.fetch(path, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeAll(async () => {
  installNestRequestContext();
  api = await startTestApi({
    controllers: [DailyController],
    providers: [
      provideFakeService(DAILY_SERVICE, {
        logView: h.logView,
        submitLog: h.submitLog,
        overview: h.overview,
        saveActuals: h.saveActuals,
        setTarget: h.setTarget,
        addFeedback: h.addFeedback,
        recap: h.recap,
        teamBreakdown: h.teamBreakdown,
        addEntry: h.addEntry,
        addGoal: h.addGoal,
        setGoalDone: h.setGoalDone,
      }),
    ],
  });
});

afterAll(() => api.close());

beforeEach(() => {
  h.session = null;
  for (const value of Object.values(h)) if (vi.isMockFunction(value)) value.mockReset();
});

const LOG_BODY = {
  date: "2026-08-25",
  tz: 0,
  sourced: 5,
  outreach: 10,
  responses: 3,
  screenings: 2,
  submitted: 1,
};

const ACTUALS_BODY = {
  date: "2026-08-25",
  sourcing: 1,
  outreach: 1,
  atsCleanup: 1,
  inbound: 1,
  screens: 1,
};

const TARGET_BODY = { userId: "u9", ...ACTUALS_BODY };

const FEEDBACK_BODY = { userId: "u9", body: "Nice work" };

/** Every endpoint, with a request that satisfies its schema and the service call it delegates to. */
const ENDPOINTS = [
  { method: "GET", path: "/daily/log", call: h.logView, body: undefined, status: 200 },
  { method: "POST", path: "/daily/log", call: h.submitLog, body: LOG_BODY, status: 201 },
  { method: "GET", path: "/daily/overview", call: h.overview, body: undefined, status: 200 },
  { method: "POST", path: "/daily/actuals", call: h.saveActuals, body: ACTUALS_BODY, status: 200 },
  { method: "POST", path: "/daily/targets", call: h.setTarget, body: TARGET_BODY, status: 200 },
  {
    method: "POST",
    path: "/daily/manager-feedback",
    call: h.addFeedback,
    body: FEEDBACK_BODY,
    status: 200,
  },
  {
    method: "GET",
    path: "/daily/recap?since=2026-08-25T00:00:00.000Z",
    call: h.recap,
    body: undefined,
    status: 200,
  },
  {
    method: "GET",
    path: "/daily/team-breakdown?weekStart=2026-08-24",
    call: h.teamBreakdown,
    body: undefined,
    status: 200,
  },
  {
    method: "POST",
    path: "/daily/journal/entries",
    call: h.addEntry,
    body: { date: "2026-08-25", text: "note" },
    status: 201,
  },
  {
    method: "POST",
    path: "/daily/journal/goals",
    call: h.addGoal,
    body: { weekStart: "2026-08-24", text: "goal" },
    status: 201,
  },
  {
    method: "PATCH",
    path: "/daily/journal/goals/g1",
    call: h.setGoalDone,
    body: { done: true },
    status: 200,
  },
] as const;

describe.each(ENDPOINTS)("$method $path", ({ method, path, call, body, status }) => {
  it("401 when signed out, and never reaches the service", async () => {
    const res = await send(method, path, body);
    expect(res.status).toBe(401);
    expect(((await res.json()) as Envelope).error.code).toBe("UNAUTHORIZED");
    expect(call).not.toHaveBeenCalled();
  });

  it(`answers ${String(status)} for a signed-in user`, async () => {
    h.session = USER;
    call.mockResolvedValue({ id: "x" });
    const res = await send(method, path, body);
    expect(res.status).toBe(status);
    expect(call).toHaveBeenCalled();
  });
});

describe("response shapes", () => {
  beforeEach(() => {
    h.session = USER;
  });

  it("wraps the submitted log as { log }", async () => {
    h.submitLog.mockResolvedValue({ id: "l1" });
    const res = await send("POST", "/daily/log", LOG_BODY);
    expect(await res.json()).toEqual({ log: { id: "l1" } });
  });

  it("wraps a new journal entry as { entry } and a new goal as { goal }", async () => {
    h.addEntry.mockResolvedValue({ id: "e1" });
    h.addGoal.mockResolvedValue({ id: "g1" });
    const entry = await send("POST", "/daily/journal/entries", { date: "2026-08-25", text: "n" });
    const goal = await send("POST", "/daily/journal/goals", { weekStart: "2026-08-24", text: "g" });
    expect(await entry.json()).toEqual({ entry: { id: "e1" } });
    expect(await goal.json()).toEqual({ goal: { id: "g1" } });
  });

  it("acknowledges the writes that return nothing with { ok: true }", async () => {
    for (const [method, path, body] of [
      ["POST", "/daily/actuals", ACTUALS_BODY],
      ["POST", "/daily/targets", TARGET_BODY],
      ["POST", "/daily/manager-feedback", FEEDBACK_BODY],
      ["PATCH", "/daily/journal/goals/g1", { done: true }],
    ] as const) {
      const res = await send(method, path, body);
      expect(await res.json()).toEqual({ ok: true });
    }
  });

  it("passes the route parameter and the session user to the goal toggle", async () => {
    await send("PATCH", "/daily/journal/goals/g7", { done: false });
    expect(h.setGoalDone).toHaveBeenCalledWith("g7", false, expect.objectContaining({ id: "u1" }));
  });
});

describe("request validation", () => {
  beforeEach(() => {
    h.session = USER;
  });

  it("422 with the BAD_REQUEST envelope on a bad body", async () => {
    const res = await send("POST", "/daily/journal/entries", { date: "25-08-2026", text: "n" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as Envelope;
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.issues?.map((i) => i.path)).toContain("date");
    expect(h.addEntry).not.toHaveBeenCalled();
  });

  it("422 on a `tz` outside the contract's range, rather than silently using UTC", async () => {
    const res = await send("GET", "/daily/log?tz=9999");
    expect(res.status).toBe(422);
    expect(h.logView).not.toHaveBeenCalled();
  });

  it("422 on a bad weekStart for the team breakdown", async () => {
    const res = await send("GET", "/daily/team-breakdown?weekStart=nope");
    expect(res.status).toBe(422);
    expect(h.teamBreakdown).not.toHaveBeenCalled();
  });
});

/**
 * The boundary case Phase 0.6 exists for. `app-tz`/`?tz=` carry `Date.getTimezoneOffset()`
 * minutes BEHIND UTC, so UTC+3 is `-180`. At 22:30Z that viewer is already on the 26th while the
 * host is still on the 25th — and at 01:30 local the same mismatch serves them YESTERDAY's log.
 */
describe("today resolves in the VIEWER's timezone, not the host's", () => {
  beforeEach(() => {
    h.session = USER;
    h.logView.mockResolvedValue({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T22:30:00.000Z"));
  });

  afterAll(() => vi.useRealTimers());

  it("takes the explicit `?tz=` and gives a UTC+3 viewer the NEXT day", async () => {
    await send("GET", "/daily/log?tz=-180");
    expect(h.logView).toHaveBeenCalledWith(expect.anything(), "2026-08-26", -180);
    vi.useRealTimers();
  });

  it("falls back to the `app-tz` cookie when no `?tz=` is sent", async () => {
    await send("GET", "/daily/log", undefined, { cookie: "app-tz=-180" });
    expect(h.logView).toHaveBeenCalledWith(expect.anything(), "2026-08-26", -180);
    vi.useRealTimers();
  });

  it("gives a UTC-5 viewer the same day the host is on", async () => {
    await send("GET", "/daily/log?tz=300");
    expect(h.logView).toHaveBeenCalledWith(expect.anything(), "2026-08-25", 300);
    vi.useRealTimers();
  });

  it("prefers an explicit `date` over either source of the offset", async () => {
    await send("GET", "/daily/log?date=2026-01-02&tz=-180");
    expect(h.logView).toHaveBeenCalledWith(expect.anything(), "2026-01-02", -180);
    vi.useRealTimers();
  });

  it("defaults to UTC when neither a `?tz=` nor a cookie is present", async () => {
    await send("GET", "/daily/log");
    expect(h.logView).toHaveBeenCalledWith(expect.anything(), "2026-08-25", 0);
    vi.useRealTimers();
  });
});

/** A stale `localStorage` timestamp must not turn a page load into a scan of the whole history. */
describe("GET /daily/recap clamps `since` to the lookback window", () => {
  beforeEach(() => {
    h.session = USER;
    h.recap.mockResolvedValue({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
  });

  afterAll(() => vi.useRealTimers());

  it("pulls a two-year-old `since` forward to the 14-day floor", async () => {
    await send("GET", "/daily/recap?since=2024-01-01T00:00:00.000Z");
    expect(h.recap).toHaveBeenCalledWith(new Date("2026-08-11T12:00:00.000Z"));
    vi.useRealTimers();
  });

  it("leaves a `since` inside the window untouched", async () => {
    await send("GET", "/daily/recap?since=2026-08-24T09:00:00.000Z");
    expect(h.recap).toHaveBeenCalledWith(new Date("2026-08-24T09:00:00.000Z"));
    vi.useRealTimers();
  });
});
