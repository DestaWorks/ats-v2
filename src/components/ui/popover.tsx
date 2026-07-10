"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Lightweight anchored popover — a trigger button and a panel that opens beneath it. Closes on
 * outside-click, Escape, or (opt-in) when a control inside it dispatches a `close` request via the
 * render-prop `close()`. This is the app's menu affordance for filter/column panels (we render
 * overlays as `Modal` for confirmations, but a filter menu wants an inline, non-blocking panel).
 *
 * `trigger` is a render-prop given the current `open` state so callers can style the pressed look;
 * it is wrapped in the actual `<button>` (with `aria-haspopup`/`aria-expanded`), so pass plain
 * content, not another button. `children` is the panel body (also a render-prop receiving `close`).
 */
export function Popover({
  trigger,
  children,
  align = "start",
  panelClassName,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: "start" | "end";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
      >
        {trigger(open)}
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          className={cn(
            "absolute top-[calc(100%+6px)] z-30 min-w-64 rounded-xl border border-black/10 bg-white p-3 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
