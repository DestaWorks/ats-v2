import { cn } from "@/lib/utils/cn";

/**
 * Loading placeholder. Respects `prefers-reduced-motion` (the pulse is disabled
 * globally in globals.css). Decorative — hidden from assistive tech.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-black/10", className)} />;
}
