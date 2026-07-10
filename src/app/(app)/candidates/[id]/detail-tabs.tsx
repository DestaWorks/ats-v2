"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabDef {
  /** Stable key + visible label. */
  key: string;
  label: ReactNode;
  panel: ReactNode;
}

/**
 * Accessible tablist (WAI-ARIA Tabs pattern): `role="tablist"` + roving `tabindex`, ArrowLeft/Right
 * to move, Home/End to jump, and focus-follows-selection (automatic activation). Each tab is wired to
 * its panel via `aria-controls`/`aria-labelledby`. Only the active panel is rendered (forms remount
 * on switch — acceptable for this slice; the seeded values come from props).
 *
 * `initialKey` selects the starting tab (alerts-panel deep links: `?tab=notes` / `?tab=license`);
 * an unknown key falls back to the first tab.
 */
export function DetailTabs({ tabs, initialKey }: { tabs: TabDef[]; initialKey?: string }) {
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      tabs.findIndex((t) => t.key === initialKey),
    ),
  );
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = (i: number) => `${baseId}-panel-${i}`;

  function focusTab(i: number) {
    setSelected(i);
    tabRefs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const last = tabs.length - 1;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusTab(selected === last ? 0 : selected + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTab(selected === 0 ? last : selected - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(last);
        break;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Candidate detail"
        className="flex gap-1 border-b border-black/10"
      >
        {tabs.map((tab, i) => {
          const active = i === selected;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={tabId(i)}
              aria-selected={active}
              aria-controls={panelId(i)}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(i)}
              onKeyDown={onKeyDown}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-semibold transition",
                active
                  ? "border-navy text-navy"
                  : "border-transparent text-gray hover:text-charcoal",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId(selected)}
        aria-labelledby={tabId(selected)}
        tabIndex={0}
        className="focus:outline-none"
      >
        {tabs[selected]?.panel}
      </div>
    </div>
  );
}
