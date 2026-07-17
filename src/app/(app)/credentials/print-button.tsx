"use client";

import { Button } from "@/components/ui/button";

/** `window.print()` trigger — matches `resume-flow.tsx`'s exact live precedent for this pattern. */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
      Print / PDF
    </Button>
  );
}
