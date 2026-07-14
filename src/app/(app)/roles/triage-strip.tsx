import Link from "next/link";
import type { TriageBadge } from "@/lib/constants";
import type { TriageRoleDTO } from "@/lib/validation/open-role";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const BADGE_TONE: Record<TriageBadge, BadgeTone> = {
  HOT: "danger",
  STALE: "amber",
  GAP: "danger",
  EASY: "success",
  P1: "navy",
  P2: "navy",
  P3: "navy",
};

const BADGE_LABEL: Record<TriageBadge, string> = {
  HOT: "🔥 Hot lead waiting",
  STALE: "⏳ Going stale",
  GAP: "⚠️ No strong matches",
  EASY: "✅ Easy win",
  P1: "P1 priority",
  P2: "P2 priority",
  P3: "P3 priority",
};

/** "Top 3 roles to work now" — server component, no interactivity beyond the link-through. */
export function TriageStrip({ roles }: { roles: TriageRoleDTO[] }) {
  if (roles.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {roles.map((r) => (
        <Link
          key={r.roleId}
          href={`/roles/${r.roleId}`}
          className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 transition hover:border-navy/30 hover:shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <Badge tone={BADGE_TONE[r.badge]}>{BADGE_LABEL[r.badge]}</Badge>
            <span className="text-xs text-gray tabular-nums">{r.daysOpen}d open</span>
          </div>
          <p className="font-serif text-sm font-semibold text-charcoal">{r.title}</p>
          <p className="text-xs text-gray">{r.clientName}</p>
          <p className="text-xs text-gray">
            {r.strongMatches} strong match{r.strongMatches === 1 ? "" : "es"}
            {r.hotMatches > 0 ? ` · ${r.hotMatches} hot` : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}
