import { redirect } from "next/navigation";

/**
 * The Weekly Brief folded into Activity (`daily-log/activity-view.tsx`), where it renders at the
 * `week` range beside that week's totals.
 *
 * It finishes what the 2026-08-04 pass started when it folded Daily Brief into Daily Log: the same
 * period was being read on two pages that could not be compared without switching between them.
 * This route stays as a redirect rather than being deleted so existing links still land.
 */
export default function WeeklyBriefPage() {
  redirect("/daily-log");
}
