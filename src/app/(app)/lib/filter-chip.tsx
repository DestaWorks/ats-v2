"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A single quick-filter toggle chip, shared by the board + list filter bars. Built on the shared
 * `Button` primitive (focus ring, disabled handling) as a real toggle button: `aria-pressed`
 * reflects the on/off state for assistive tech, and the variant flips (primary when on, secondary
 * when off) for a visible pressed state. Callers own what "toggle" means — server chips flip a URL
 * param, page-local chips flip client state.
 */
export function FilterChip({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "primary" : "secondary"}
      aria-pressed={pressed}
      onClick={onToggle}
      className="rounded-full"
    >
      {children}
    </Button>
  );
}
