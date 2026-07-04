/**
 * Pure board transforms for the optimistic move flow. No React, no fetch, no `server-only` —
 * unit-tested in isolation. `moveCardBetweenColumns` relocates a card between the active-stage
 * columns (or removes it when the target is terminal); the returned `revert` restores the exact
 * pre-move columns array. `applyBoardMove` composes it for the `useOptimistic` reducer, also
 * bumping the terminal-rail counts and re-deriving `meta`.
 */
import type { CandidateStatus } from "@/lib/constants";
import { isTerminalStatus, statusOrder } from "@/lib/constants";
import type { BoardColumn, BoardResponse, CandidateCardDTO } from "@/lib/validation/pipeline";

function locate(columns: BoardColumn[], cardId: string): CandidateCardDTO | null {
  for (const col of columns) {
    const found = col.candidates.find((c) => c.id === cardId);
    if (found) return found;
  }
  return null;
}

/** The moved card, re-projected the way the server does on a fresh stage entry. */
function projectMoved(card: CandidateCardDTO, toStatus: CandidateStatus): CandidateCardDTO {
  return {
    ...card,
    status: toStatus,
    stageOrder: statusOrder(toStatus),
    daysInStage: 0,
    isOverdue: false,
    isStuck: false,
  };
}

export interface ColumnsMove {
  columns: BoardColumn[];
  /** Restore the exact pre-move columns (the original array reference, untouched). */
  revert: () => BoardColumn[];
}

/**
 * Move `cardId` into `toStatus` across the active-stage columns. Pure: never mutates the input.
 * No-op (returns the input array + a revert to it) when the card is absent or already in the
 * target stage. A terminal `toStatus` removes the card from its source column (terminals are not
 * board columns) — the caller reflects the terminal count via `applyBoardMove`.
 */
export function moveCardBetweenColumns(
  columns: BoardColumn[],
  cardId: string,
  toStatus: CandidateStatus,
): ColumnsMove {
  const card = locate(columns, cardId);
  if (!card || card.status === toStatus) {
    return { columns, revert: () => columns };
  }
  const fromStatus = card.status;
  const moved = projectMoved(card, toStatus);
  const targetIsActive = !isTerminalStatus(toStatus);

  // `count` is the column's TRUE total (from the server `groupBy`), while `candidates` is only the
  // loaded page (≤ BOARD_PAGE). So adjust `count` by ±1 — never derive it from `candidates.length`,
  // which would collapse a paginated column's total and hide its "Load more" (B1).
  const next = columns.map((col) => {
    if (col.status === fromStatus) {
      return {
        ...col,
        candidates: col.candidates.filter((c) => c.id !== cardId),
        count: Math.max(0, col.count - 1),
      };
    }
    if (targetIsActive && col.status === toStatus) {
      return { ...col, candidates: [moved, ...col.candidates], count: col.count + 1 };
    }
    return col;
  });

  return { columns: next, revert: () => columns };
}

/**
 * Apply a move to the whole board for the optimistic reducer: relocate the card, adjust
 * `meta.active/overdue/stuck` by the move's DELTA, and bump the target terminal's count (and its
 * card list when it was loaded). Returns the input board unchanged on a no-op.
 *
 * `meta` is adjusted by delta — NOT re-summed from the columns, because overdue/stuck came from
 * full-table server counts while only a page of cards is loaded (re-summing would undercount, M1).
 * A move always leaves an active source column; the card lands with fresh timing (`projectMoved`
 * clears overdue/stuck), so: `active −1` iff the target is terminal; `overdue/stuck −1` iff the
 * moved card was overdue/stuck.
 */
export function applyBoardMove(
  board: BoardResponse,
  cardId: string,
  toStatus: CandidateStatus,
): BoardResponse {
  const card = locate(board.columns, cardId);
  if (!card || card.status === toStatus) return board;

  const { columns } = moveCardBetweenColumns(board.columns, cardId, toStatus);
  const active = board.meta.active - (isTerminalStatus(toStatus) ? 1 : 0);
  const overdue = board.meta.overdue - (card.isOverdue ? 1 : 0);
  const stuck = board.meta.stuck - (card.isStuck ? 1 : 0);

  let terminal = board.terminal;
  if (isTerminalStatus(toStatus)) {
    const moved = projectMoved(card, toStatus);
    terminal = board.terminal.map((t) =>
      t.status === toStatus
        ? {
            ...t,
            count: t.count + 1,
            candidates: t.candidates ? [moved, ...t.candidates] : t.candidates,
          }
        : t,
    );
  }

  return { columns, terminal, meta: { total: board.meta.total, active, overdue, stuck } };
}
