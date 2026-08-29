import { EmptyState } from "@destaworks/ui/empty-state";

/**
 * A page whose endpoint does not exist yet. Deliberately unmistakable: the shell, the gate and
 * the navigation are what this phase's slice built, and a placeholder that looked like a real
 * empty list would hide which is which.
 */
export function NotBuiltYet({ what, endpoint }: { what: string; endpoint: string }) {
  return (
    <EmptyState
      title={`${what} — not built yet`}
      description={`This page is a placeholder. It renders once ${endpoint} exists on apps/api; no shape is assumed here in the meantime.`}
    />
  );
}
