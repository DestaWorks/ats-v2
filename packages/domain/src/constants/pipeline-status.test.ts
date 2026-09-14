import { describe, it, expect } from "vitest";
import {
  PIPELINE_STAGES,
  ALL_STATUS_CODES,
  ACTIVE_STATUS_CODES,
  TERMINAL_STATUS_CODES,
  isCandidateStatus,
  statusLabel,
  statusOrder,
  isTerminalStatus,
  statusSlaDays,
  toLegacyStatusLabel,
  fromLegacyStatusLabel,
} from "./pipeline-status";

describe("pipeline-status", () => {
  it("has 13 stages with unique, contiguous orders 0..12", () => {
    expect(PIPELINE_STAGES).toHaveLength(13);
    const orders = PIPELINE_STAGES.map((s) => s.order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("splits into 9 active + 4 terminal", () => {
    expect(ACTIVE_STATUS_CODES).toHaveLength(9);
    expect(TERMINAL_STATUS_CODES).toHaveLength(4);
    expect(ALL_STATUS_CODES).toHaveLength(13);
    expect(TERMINAL_STATUS_CODES).toEqual([
      "NOT_QUALIFIED",
      "NO_RESPONSE",
      "CLIENT_REJECTED",
      "FUTURE_PIPELINE",
    ]);
  });

  it("resolves label and order by code", () => {
    expect(statusLabel("SUBMITTED_TO_CLIENT")).toBe("Submitted to Client");
    expect(statusOrder("SUBMITTED_TO_CLIENT")).toBe(4);
    expect(statusLabel("STARTED_DAY1")).toBe("Started (Day 1)");
  });

  it("flags terminal statuses", () => {
    expect(isTerminalStatus("FUTURE_PIPELINE")).toBe(true);
    expect(isTerminalStatus("NEW_CANDIDATE")).toBe(false);
  });

  it("returns SLA days for active stages, null for Started + terminals (ported STAGE_ALERTS)", () => {
    expect(statusSlaDays("NEW_CANDIDATE")).toBe(3);
    expect(statusSlaDays("QUALIFIED_PRESCREEN")).toBe(2);
    expect(statusSlaDays("SUBMITTED_TO_CLIENT")).toBe(7);
    expect(statusSlaDays("OFFER_ACCEPTED")).toBe(3);
    expect(statusSlaDays("STARTED_DAY1")).toBeNull();
    expect(statusSlaDays("NOT_QUALIFIED")).toBeNull();
  });

  it("guards unknown status strings", () => {
    expect(isCandidateStatus("NEW_CANDIDATE")).toBe(true);
    expect(isCandidateStatus("0 - New Candidate")).toBe(false);
    expect(isCandidateStatus("nonsense")).toBe(false);
  });

  it("round-trips legacy label ↔ code (migration interop)", () => {
    expect(toLegacyStatusLabel("NEW_CANDIDATE")).toBe("0 - New Candidate");
    expect(toLegacyStatusLabel("SUBMITTED_TO_CLIENT")).toBe("4 - Submitted to Client");
    expect(fromLegacyStatusLabel("4 - Submitted to Client")).toBe("SUBMITTED_TO_CLIENT");
    expect(fromLegacyStatusLabel("  8 - Started (Day 1)  ")).toBe("STARTED_DAY1");
    expect(fromLegacyStatusLabel("not a real label")).toBeUndefined();

    // Every code must round-trip through its legacy label.
    for (const code of ALL_STATUS_CODES) {
      expect(fromLegacyStatusLabel(toLegacyStatusLabel(code))).toBe(code);
    }
  });
});
