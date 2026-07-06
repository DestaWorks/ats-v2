import { describe, it, expect } from "vitest";
import { buildLeadsQuery, leadActionState } from "./leads-query";

describe("buildLeadsQuery", () => {
  it("carries the current status/source/search filters plus the cursor", () => {
    const sp = new URLSearchParams({ status: "Outreach 1", source: "LinkedIn", search: "amanuel" });
    const q = new URLSearchParams(buildLeadsQuery(sp, "cursor-123"));
    expect(q.get("status")).toBe("Outreach 1");
    expect(q.get("source")).toBe("LinkedIn");
    expect(q.get("search")).toBe("amanuel");
    expect(q.get("cursor")).toBe("cursor-123");
  });

  it("drops empty/absent filters and omits a null cursor", () => {
    const sp = new URLSearchParams({ status: "", search: "np" });
    const q = new URLSearchParams(buildLeadsQuery(sp, null));
    expect(q.has("status")).toBe(false);
    expect(q.has("source")).toBe(false);
    expect(q.get("search")).toBe("np");
    expect(q.has("cursor")).toBe(false);
  });

  it("ignores unrelated URL params (only the server filters are forwarded)", () => {
    const sp = new URLSearchParams({ status: "Sourced", foo: "bar", page: "2" });
    const q = new URLSearchParams(buildLeadsQuery(sp, null));
    expect(q.get("status")).toBe("Sourced");
    expect(q.has("foo")).toBe(false);
    expect(q.has("page")).toBe(false);
  });
});

describe("leadActionState", () => {
  it("enables every action for an active lead", () => {
    expect(leadActionState("Sourced")).toEqual({
      canLogOutreach: true,
      canRespond: true,
      canPromote: true,
    });
    expect(leadActionState("Responded — Hot")).toEqual({
      canLogOutreach: true,
      canRespond: true,
      canPromote: true,
    });
  });

  it("disables every action once the lead is Promoted (terminal)", () => {
    expect(leadActionState("Promoted")).toEqual({
      canLogOutreach: false,
      canRespond: false,
      canPromote: false,
    });
  });
});
