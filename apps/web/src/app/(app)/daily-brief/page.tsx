import { redirect } from "next/navigation";

/**
 * Design pass 2026-08-04: Daily Brief folded into Daily Log (`daily-log/team-brief-section.tsx`,
 * leadership-only) — three same-shaped flat nav items (Daily Log / Daily Brief / Weekly Brief),
 * two of which were an ungated team-wide AI report, read as confusing clutter. This route stays
 * as a redirect (not deleted outright) so any existing bookmark/link still lands somewhere real
 * instead of a 404.
 */
export default function DailyBriefPage() {
  redirect("/daily-log");
}
