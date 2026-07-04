import { describe, expect, it } from "vitest";
import type { BoardColumn, BoardResponse, CandidateCardDTO } from "@/lib/validation/pipeline";
import { applyBoardMove, moveCardBetweenColumns } from "./optimistic-move";

function card(id: string, status: CandidateCardDTO["status"], over = false): CandidateCardDTO {
  return {
    id,
    name: `Cand ${id}`,
    track: "Clinical",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseStatus: "Active",
    clientId: null,
    clientName: null,
    status,
    stageOrder: 0,
    daysInStage: over ? 9 : 1,
    isOverdue: over,
    isStuck: over,
    score: null,
  };
}

function col(status: CandidateCardDTO["status"], candidates: CandidateCardDTO[]): BoardColumn {
  return { status, label: status, stageOrder: 0, count: candidates.length, candidates };
}

function baseColumns(): BoardColumn[] {
  return [
    col("NEW_CANDIDATE", [card("a", "NEW_CANDIDATE"), card("b", "NEW_CANDIDATE", true)]),
    col("QUALIFIED_PRESCREEN", [card("c", "QUALIFIED_PRESCREEN")]),
    col("INITIAL_SCREENING", []),
  ];
}

describe("moveCardBetweenColumns", () => {
  it("moves a card between active columns and updates counts", () => {
    const columns = baseColumns();
    const { columns: next } = moveCardBetweenColumns(columns, "a", "QUALIFIED_PRESCREEN");

    const from = next.find((c) => c.status === "NEW_CANDIDATE")!;
    const to = next.find((c) => c.status === "QUALIFIED_PRESCREEN")!;
    expect(from.candidates.map((c) => c.id)).toEqual(["b"]);
    expect(from.count).toBe(1);
    expect(to.candidates.map((c) => c.id)).toEqual(["a", "c"]);
    expect(to.count).toBe(2);
    // moved card is re-projected to a fresh stage entry
    const moved = to.candidates[0]!;
    expect(moved.status).toBe("QUALIFIED_PRESCREEN");
    expect(moved.daysInStage).toBe(0);
    expect(moved.isOverdue).toBe(false);
    expect(moved.isStuck).toBe(false);
  });

  it("preserves a paginated column's TRUE count (±1), not the loaded page length (B1)", () => {
    // count ≫ loaded cards — the paginated case the old `count: candidates.length` collapsed.
    const columns: BoardColumn[] = [
      {
        status: "NEW_CANDIDATE",
        label: "New",
        stageOrder: 0,
        count: 100,
        candidates: [card("a", "NEW_CANDIDATE"), card("b", "NEW_CANDIDATE")],
      },
      {
        status: "QUALIFIED_PRESCREEN",
        label: "Q",
        stageOrder: 1,
        count: 50,
        candidates: [card("c", "QUALIFIED_PRESCREEN")],
      },
    ];
    const { columns: next } = moveCardBetweenColumns(columns, "a", "QUALIFIED_PRESCREEN");
    expect(next.find((c) => c.status === "NEW_CANDIDATE")!.count).toBe(99); // 100−1, not loaded len 1
    expect(next.find((c) => c.status === "QUALIFIED_PRESCREEN")!.count).toBe(51); // 50+1, not 2
  });

  it("removes the card from its column when the target is terminal", () => {
    const columns = baseColumns();
    const { columns: next } = moveCardBetweenColumns(columns, "b", "NOT_QUALIFIED");
    const from = next.find((c) => c.status === "NEW_CANDIDATE")!;
    expect(from.candidates.map((c) => c.id)).toEqual(["a"]);
    expect(from.count).toBe(1);
    // no active column gains it (terminals are not board columns)
    expect(next.some((c) => c.candidates.some((x) => x.id === "b"))).toBe(false);
  });

  it("is a pure no-op when the card is missing", () => {
    const columns = baseColumns();
    const res = moveCardBetweenColumns(columns, "zzz", "QUALIFIED_PRESCREEN");
    expect(res.columns).toBe(columns);
    expect(res.revert()).toBe(columns);
  });

  it("is a no-op when the card is already in the target stage", () => {
    const columns = baseColumns();
    const res = moveCardBetweenColumns(columns, "a", "NEW_CANDIDATE");
    expect(res.columns).toBe(columns);
  });

  it("does not mutate the input and revert restores the exact prior state", () => {
    const columns = baseColumns();
    const snapshot = JSON.parse(JSON.stringify(columns));
    const { columns: next, revert } = moveCardBetweenColumns(columns, "a", "INITIAL_SCREENING");

    expect(next).not.toBe(columns);
    // input untouched
    expect(columns).toEqual(snapshot);
    // revert yields the identical original reference (exact prior state)
    expect(revert()).toBe(columns);
    expect(revert()).toEqual(snapshot);
  });
});

describe("applyBoardMove", () => {
  function board(): BoardResponse {
    return {
      columns: baseColumns(),
      terminal: [
        { status: "NOT_QUALIFIED", label: "Not Qualified", count: 0, candidates: [] },
        { status: "NO_RESPONSE", label: "No Response", count: 2 },
      ],
      meta: { total: 5, active: 3, overdue: 1, stuck: 1 },
    };
  }

  it("re-derives meta after an active move", () => {
    const next = applyBoardMove(board(), "b", "INITIAL_SCREENING");
    // 'b' (overdue+stuck) stays active but its timing resets → overdue/stuck drop to 0
    expect(next.meta.active).toBe(3);
    expect(next.meta.overdue).toBe(0);
    expect(next.meta.stuck).toBe(0);
    expect(next.meta.total).toBe(5);
  });

  it("adjusts meta by delta on a paginated board — not re-summed from loaded pages (M1)", () => {
    const b: BoardResponse = {
      columns: [
        {
          status: "NEW_CANDIDATE",
          label: "New",
          stageOrder: 0,
          count: 100,
          candidates: [card("x", "NEW_CANDIDATE", true)], // overdue + stuck
        },
        { status: "QUALIFIED_PRESCREEN", label: "Q", stageOrder: 1, count: 50, candidates: [] },
      ],
      terminal: [],
      meta: { total: 150, active: 150, overdue: 30, stuck: 20 },
    };
    const next = applyBoardMove(b, "x", "QUALIFIED_PRESCREEN");
    // active→active keeps active; moved card was overdue+stuck → each −1 (NOT collapsed to loaded ≈0)
    expect(next.meta.active).toBe(150);
    expect(next.meta.overdue).toBe(29);
    expect(next.meta.stuck).toBe(19);
    expect(next.columns.find((c) => c.status === "NEW_CANDIDATE")!.count).toBe(99);
    expect(next.columns.find((c) => c.status === "QUALIFIED_PRESCREEN")!.count).toBe(51);
  });

  it("bumps the terminal count and list when the target terminal was loaded", () => {
    const next = applyBoardMove(board(), "a", "NOT_QUALIFIED");
    const nq = next.terminal.find((t) => t.status === "NOT_QUALIFIED")!;
    expect(nq.count).toBe(1);
    expect(nq.candidates?.map((c) => c.id)).toEqual(["a"]);
    // active total drops by one
    expect(next.meta.active).toBe(2);
  });

  it("bumps a terminal count without a loaded list", () => {
    const next = applyBoardMove(board(), "a", "NO_RESPONSE");
    const nr = next.terminal.find((t) => t.status === "NO_RESPONSE")!;
    expect(nr.count).toBe(3);
    expect(nr.candidates).toBeUndefined();
  });

  it("returns the same board on a no-op", () => {
    const b = board();
    expect(applyBoardMove(b, "missing", "NOT_QUALIFIED")).toBe(b);
    expect(applyBoardMove(b, "a", "NEW_CANDIDATE")).toBe(b);
  });
});
