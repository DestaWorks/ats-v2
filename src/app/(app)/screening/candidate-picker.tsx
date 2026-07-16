"use client";

import type { ScreeningCandidateDTO } from "@/lib/validation/screening";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/** Debounced candidate search + list, scoped server-side to the 3 screening-eligible stages
 *  (legacy: the `scCandSearch` combobox, `legacy/index.html:6790`). */
export function CandidatePicker({
  candidates,
  search,
  onSearchChange,
  selectedId,
  onSelect,
}: {
  candidates: ScreeningCandidateDTO[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (candidate: ScreeningCandidateDTO) => void;
}) {
  return (
    <Card className="flex flex-col gap-2 p-3">
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search candidates…"
        aria-label="Search candidates to screen"
      />
      <div className="flex flex-col gap-1">
        {candidates.length === 0 ? (
          <p className="px-1 py-2 text-sm text-gray">No candidates in an eligible stage.</p>
        ) : (
          candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-black/[0.03]",
                selectedId === c.id && "bg-label/40",
              )}
            >
              <span className="font-medium text-charcoal">{c.name}</span>
              <span className="text-xs text-gray">
                {[c.credential, c.statusLabel].filter(Boolean).join(" · ")}
                {c.clientName ? ` · ${c.clientName}` : ""}
              </span>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}
