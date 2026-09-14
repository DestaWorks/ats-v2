import { cn } from "@destaworks/domain/utils/cn";

/**
 * Shown when a workspace's plan does not include the feature. Deliberately NOT `ErrorState`:
 * nothing failed and nothing is forbidden — it simply has not been bought, which is an invitation
 * rather than a refusal, so it reads calm instead of red.
 */
export function UpsellState({
  feature,
  description,
  className,
}: {
  feature: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-black/10 bg-white px-6 py-14 text-center shadow-card",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy/5 text-xl">
        ✦
      </span>
      <h3 className="text-base font-semibold text-navy">{feature} isn&apos;t on your plan</h3>
      <p className="max-w-sm text-sm text-gray">
        {description ?? `Your workspace doesn't include ${feature} yet.`}
      </p>
      <p className="mt-1 text-xs text-gray">Talk to your workspace owner about adding it.</p>
    </div>
  );
}
