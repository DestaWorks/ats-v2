import "server-only";
import type {
  TemplatePerformanceDTO,
  TemplatePerformanceRowDTO,
} from "@/lib/validation/template-performance";
import { findTemplate } from "@/lib/constants/templates";
import { templatePerformanceRepository } from "@/server/repositories/template-performance.repository";

const MS_PER_DAY = 86_400_000;

/**
 * Template Performance (Wave 4.1, legacy `index.html:8784-8855`) — usage + response-rate per
 * template. `sends` counts BOTH candidate and lead attempts (this app's unified `outreach_attempts`
 * table lets it, unlike legacy's lead-only analytics — see `docs/IMPLEMENTATION-PLAN.md` Wave 4.1
 * notes). `responses`/`rate`/`avgDays` are LEAD-ONLY: candidates have no "responded" concept in
 * this app (no equivalent of `SourceLead.respondedAt`/Hot-Cold), so there's no response signal to
 * compute from on the candidate side — `rate`/`avgDays` are `null` for a template that was only
 * ever sent to candidates, not a fabricated 0%.
 */
export const templatePerformanceService = {
  async overview(): Promise<TemplatePerformanceDTO> {
    const attempts = await templatePerformanceRepository.attemptsWithTemplate();

    const byTemplate = new Map<string, typeof attempts>();
    for (const a of attempts) {
      const id = a.templateId as string; // repo already filters templateId: { not: null }
      const bucket = byTemplate.get(id);
      if (bucket) bucket.push(a);
      else byTemplate.set(id, [a]);
    }

    const rows: TemplatePerformanceRowDTO[] = [];
    for (const [templateId, rows_] of byTemplate) {
      const def = findTemplate(templateId);
      const leadRows = rows_.filter((a) => a.leadId != null);
      const candidateSends = rows_.filter((a) => a.candidateId != null).length;
      const responses = leadRows.filter((a) => a.response != null).length;
      const rate = leadRows.length > 0 ? Math.round((responses * 100) / leadRows.length) : null;

      const days = leadRows
        .filter((a) => a.respondedAt != null)
        .map((a) => Math.floor((a.respondedAt!.getTime() - a.at.getTime()) / MS_PER_DAY))
        .filter((d) => Number.isFinite(d) && d >= 0);
      const avgDays =
        days.length > 0 ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null;

      const channelCounts = new Map<string, number>();
      for (const a of rows_) channelCounts.set(a.channel, (channelCounts.get(a.channel) ?? 0) + 1);
      const topChannel = [...channelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      rows.push({
        templateId,
        templateName: def?.name ?? templateId,
        category: def?.category ?? "unknown",
        sends: rows_.length,
        candidateSends,
        leadSends: leadRows.length,
        responses,
        rate,
        avgDays,
        topChannel,
      });
    }

    rows.sort((a, b) => b.sends - a.sends);
    return { rows };
  },
};
