import { describe, it, expect } from "vitest";
import { LEAD_STATUSES } from "@/lib/constants";
import {
  advanceOnOutreach,
  canLogOutreach,
  canPromote,
  canRespond,
  setResponse,
} from "./lead-lifecycle";

describe("advanceOnOutreach", () => {
  it("walks Sourced → Outreach 1 → Outreach 2 → Outreach 3 (Final)", () => {
    expect(advanceOnOutreach("Sourced")).toBe("Outreach 1");
    expect(advanceOnOutreach("Outreach 1")).toBe("Outreach 2");
    expect(advanceOnOutreach("Outreach 2")).toBe("Outreach 3 (Final)");
  });

  it("CAPS at Outreach 3 (Final) — status holds (the count still increments in the service)", () => {
    expect(advanceOnOutreach("Outreach 3 (Final)")).toBe("Outreach 3 (Final)");
  });

  it("HOLDS status for a responded lead (you can keep chasing — attempt still recorded)", () => {
    expect(advanceOnOutreach("Responded — Hot")).toBe("Responded — Hot");
    expect(advanceOnOutreach("Responded — Cold")).toBe("Responded — Cold");
  });

  it("HOLDS status for the closed buckets", () => {
    expect(advanceOnOutreach("No Response")).toBe("No Response");
    expect(advanceOnOutreach("Bad Fit")).toBe("Bad Fit");
    expect(advanceOnOutreach("Future Collaboration")).toBe("Future Collaboration");
  });
});

describe("setResponse", () => {
  it("maps Hot/Cold to the two responded labels", () => {
    expect(setResponse("Hot")).toBe("Responded — Hot");
    expect(setResponse("Cold")).toBe("Responded — Cold");
  });
});

describe("guards (canLogOutreach / canRespond / canPromote)", () => {
  it("reject ONLY the terminal Promoted status", () => {
    for (const status of LEAD_STATUSES) {
      const expected = status !== "Promoted";
      expect(canLogOutreach(status)).toBe(expected);
      expect(canRespond(status)).toBe(expected);
      expect(canPromote(status)).toBe(expected);
    }
  });

  it("Promoted is terminal for every action", () => {
    expect(canLogOutreach("Promoted")).toBe(false);
    expect(canRespond("Promoted")).toBe(false);
    expect(canPromote("Promoted")).toBe(false);
  });
});
