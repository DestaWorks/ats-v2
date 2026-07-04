import { describe, it, expect, vi } from "vitest";

/**
 * Pure match tests (Wave 1.2 §8) — the critical no-silent-wrong-person-merge safety net:
 * email-exact → `auto`; name-fuzzy (no email) → `confirm`; below threshold → `none` (never a
 * silent attach); and `classifyMatch` (used by the save path) rejects a weak `confirmedCandidateId`.
 */

vi.mock("server-only", () => ({}));

import { classifyMatch, matchResumeToCandidate, type MatchCandidate } from "./resume.match";
import type { ResumeData } from "@/lib/validation/resume";

/** Only `name`/`email` drive matching — a minimal résumé is enough for these pure tests. */
function resume(name: string, email: string): ResumeData {
  return { name, email } as unknown as ResumeData;
}

describe("matchResumeToCandidate", () => {
  it("email-exact (case/space-insensitive) → auto", () => {
    const candidates: MatchCandidate[] = [
      { id: "c1", name: "Totally Different Name", email: "  JANE@Example.com " },
    ];
    const match = matchResumeToCandidate(resume("Jane Doe", "jane@example.com"), candidates);
    expect(match).toMatchObject({ status: "auto", candidateId: "c1", reason: "email-exact" });
  });

  it("name-fuzzy with no email match → confirm", () => {
    const candidates: MatchCandidate[] = [
      { id: "c2", name: "Jonathan Q. Smith", email: "different@other.com" },
    ];
    // Nearly identical name, different email → confirm (requires explicit user toggle).
    const match = matchResumeToCandidate(
      resume("Jonathan Q Smith", "jane@example.com"),
      candidates,
    );
    expect(match).toMatchObject({ status: "confirm", candidateId: "c2", reason: "name-fuzzy" });
    if (match.status === "confirm") expect(match.score).toBeGreaterThanOrEqual(0.9);
  });

  it("below threshold (weak name, no email) → none (no silent attach)", () => {
    const candidates: MatchCandidate[] = [
      { id: "c3", name: "Robert Johnson", email: "rob@other.com" },
    ];
    const match = matchResumeToCandidate(resume("Jane Doe", "jane@example.com"), candidates);
    expect(match).toEqual({ status: "none", score: 0 });
  });

  it("prefers an email-exact auto over any name-fuzzy confirm in the list", () => {
    const candidates: MatchCandidate[] = [
      { id: "confirmer", name: "Jane Doe", email: "someoneelse@x.com" },
      { id: "auto", name: "Unrelated", email: "jane@example.com" },
    ];
    const match = matchResumeToCandidate(resume("Jane Doe", "jane@example.com"), candidates);
    expect(match).toMatchObject({ status: "auto", candidateId: "auto" });
  });
});

describe("classifyMatch (save-path re-check)", () => {
  it("classifies an exact-email candidate as auto", () => {
    expect(
      classifyMatch(resume("Jane Doe", "jane@example.com"), {
        id: "c1",
        name: "X",
        email: "jane@example.com",
      }),
    ).toBe("auto");
  });

  it("classifies a near-identical name (no email) as confirm", () => {
    expect(
      classifyMatch(resume("Jonathan Q Smith", ""), {
        id: "c2",
        name: "Jonathan Q. Smith",
        email: null,
      }),
    ).toBe("confirm");
  });

  it("rejects a non-re-matching confirmedCandidateId as none", () => {
    // A confirmedCandidateId echoed by the client that the server does NOT re-match → none,
    // so the save path refuses the attach and creates a new candidate instead.
    expect(
      classifyMatch(resume("Jane Doe", "jane@example.com"), {
        id: "wrong",
        name: "Completely Unrelated Person",
        email: "unrelated@other.com",
      }),
    ).toBe("none");
  });
});
