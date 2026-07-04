import { describe, it, expect } from "vitest";
import { normalizeLeadStatus } from "./normalize-lead-status";

describe("normalizeLeadStatus", () => {
  it("defaults empty / new / unknown to Sourced", () => {
    expect(normalizeLeadStatus("")).toBe("Sourced");
    expect(normalizeLeadStatus(null)).toBe("Sourced");
    expect(normalizeLeadStatus(undefined)).toBe("Sourced");
    expect(normalizeLeadStatus("new")).toBe("Sourced");
    expect(normalizeLeadStatus("New Candidate")).toBe("Sourced");
    expect(normalizeLeadStatus("something random")).toBe("Sourced");
  });

  it("tiers outreach by number/final", () => {
    expect(normalizeLeadStatus("Outreach 1")).toBe("Outreach 1");
    expect(normalizeLeadStatus("outreach attempt 2")).toBe("Outreach 2");
    expect(normalizeLeadStatus("Outreach 3")).toBe("Outreach 3 (Final)");
    expect(normalizeLeadStatus("final outreach")).toBe("Outreach 3 (Final)");
    expect(normalizeLeadStatus("outreach")).toBe("Outreach 1");
  });

  it("classifies responses hot vs cold", () => {
    expect(normalizeLeadStatus("Responded")).toBe("Responded — Hot");
    expect(normalizeLeadStatus("responded - cold")).toBe("Responded — Cold");
    expect(normalizeLeadStatus("responded, not interested")).toBe("Responded — Cold");
  });

  it("maps the terminal buckets", () => {
    expect(normalizeLeadStatus("No response yet")).toBe("No Response");
    expect(normalizeLeadStatus("bad fit")).toBe("Bad Fit");
    expect(normalizeLeadStatus("not a fit")).toBe("Bad Fit");
    expect(normalizeLeadStatus("future collab")).toBe("Future Collaboration");
    expect(normalizeLeadStatus("hired")).toBe("Promoted");
    expect(normalizeLeadStatus("promoted to pipeline")).toBe("Promoted");
    expect(normalizeLeadStatus("placed")).toBe("Promoted");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeLeadStatus("  RESPONDED — HOT  ")).toBe("Responded — Hot");
  });
});
