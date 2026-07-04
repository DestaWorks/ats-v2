import { describe, expect, it } from "vitest";
import type { ResumeMatch } from "@/lib/validation/resume";
import { canAttach, confirmedCandidateIdFor, defaultConfirmed } from "./confirm-gate";

const auto: ResumeMatch = {
  status: "auto",
  candidateId: "cand_auto",
  candidateName: "Dr. Alice Auto",
  score: 1,
  reason: "email-exact",
};
const confirm: ResumeMatch = {
  status: "confirm",
  candidateId: "cand_confirm",
  candidateName: "Bob Confirm",
  score: 0.92,
  reason: "name-fuzzy",
};
const none: ResumeMatch = { status: "none", score: 0 };

describe("defaultConfirmed", () => {
  it("pre-selects an auto (email-exact) match", () => {
    expect(defaultConfirmed(auto)).toBe(true);
  });
  it("does NOT pre-select a confirm (name-fuzzy) match — user must tick", () => {
    expect(defaultConfirmed(confirm)).toBe(false);
  });
  it("does NOT pre-select a none match", () => {
    expect(defaultConfirmed(none)).toBe(false);
  });
});

describe("canAttach", () => {
  it("auto → always attaches (email dedupe), regardless of the toggle", () => {
    expect(canAttach(auto, true)).toBe(true);
    expect(canAttach(auto, false)).toBe(true);
  });
  it("confirm → attaches only if the user explicitly checked", () => {
    expect(canAttach(confirm, true)).toBe(true);
    expect(canAttach(confirm, false)).toBe(false);
  });
  it("none → never attaches, even if confirmed is forced true", () => {
    expect(canAttach(none, true)).toBe(false);
    expect(canAttach(none, false)).toBe(false);
  });
});

describe("confirmedCandidateIdFor", () => {
  it("sends the id for an auto match regardless of the toggle (email dedupe)", () => {
    expect(confirmedCandidateIdFor(auto, true)).toBe("cand_auto");
    expect(confirmedCandidateIdFor(auto, false)).toBe("cand_auto");
  });
  it("sends the id only after explicit confirmation of a fuzzy match", () => {
    expect(confirmedCandidateIdFor(confirm, false)).toBeUndefined();
    expect(confirmedCandidateIdFor(confirm, true)).toBe("cand_confirm");
  });
  it("never sends an id for a none match (no wrong-person merge)", () => {
    expect(confirmedCandidateIdFor(none, true)).toBeUndefined();
    expect(confirmedCandidateIdFor(none, false)).toBeUndefined();
  });
});
