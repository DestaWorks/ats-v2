/**
 * Join class names, dropping falsy values. A tiny dependency-free helper for
 * conditional Tailwind classes. (Swap for `clsx` + `tailwind-merge` later if we
 * need class de-duplication — not needed yet.)
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
