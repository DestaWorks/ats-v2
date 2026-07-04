"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { BoardTerminal } from "@/lib/validation/pipeline";
import { STATUS_BG } from "./lib/status-style";

/**
 * Collapsed side rail of the 4 terminal states (counts always shown). Expanding requests the
 * candidate lists (`includeTerminal=1`) via `onExpand`; you move a card *into* a terminal state
 * through the per-card status <select>, never by dragging onto this rail.
 */
export function TerminalRail({
  terminal,
  onExpand,
  loading,
}: {
  terminal: BoardTerminal[];
  onExpand: () => void;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const anyLoaded = terminal.some((t) => t.candidates !== undefined);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !anyLoaded) onExpand();
  }

  return (
    <aside
      aria-label="Terminal states"
      className="flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-black/5 bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wide text-gray uppercase">Terminal</h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-navy transition hover:bg-navy/5"
        >
          {expanded ? "Hide names" : "Show names"}
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {terminal.map((t) => (
          <li key={t.status} className="rounded-lg border border-black/5 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("h-2 w-2 rounded-full", STATUS_BG[t.status])} />
                <span className="text-xs font-medium text-charcoal">{t.label}</span>
              </span>
              <span className="text-xs font-semibold text-gray">{t.count}</span>
            </div>

            {expanded ? (
              <div className="mt-1.5 border-t border-black/5 pt-1.5">
                {loading && t.candidates === undefined ? (
                  <p className="text-[11px] text-gray">Loading…</p>
                ) : t.candidates && t.candidates.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {t.candidates.map((c) => (
                      <li key={c.id} className="truncate text-[11px] text-gray">
                        {c.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-gray italic">None</p>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
