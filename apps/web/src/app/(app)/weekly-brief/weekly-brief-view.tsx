"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { dateKey, mondayOf } from "@destaworks/domain/daily";
import { useTzCookieSync } from "@/lib/use-tz-cookie-sync";
import type { WeeklyBriefAiOutput, WeeklyBriefDTO } from "@destaworks/contracts/validation/briefs";
import { getJson, messageForFailure, postJson } from "@/lib/api/client";
import { awaitBriefDraft } from "@/lib/api/await-brief-draft";
import type { GetBriefsWeeklyResponse } from "@/app/api/briefs/weekly/route";
import type { PostBriefsWeeklyGenerateResponse } from "@/app/api/briefs/weekly/generate/route";
import type { PostBriefsWeeklyPatternsResponse } from "@/app/api/briefs/weekly/patterns/route";
import type { PostBriefsWeeklySaveResponse } from "@/app/api/briefs/weekly/save/route";
import { Button } from "@destaworks/ui/button";
import { Card } from "@destaworks/ui/card";
import { Field } from "@destaworks/ui/field";
import { Input } from "@destaworks/ui/input";

type Draft = WeeklyBriefAiOutput & { weekStart: string };

/**
 * Narrow a DTO down to the AI fields — the save endpoint's schema is `.strict()`, so a whole DTO
 * spread into it (attribution, draft columns and all) is a 400.
 */
function toDraft(source: WeeklyBriefAiOutput, weekStart: string): Draft {
  return {
    weekStart,
    headline: source.headline,
    kpiNarrative: source.kpiNarrative,
    clientCards: source.clientCards,
    perAssociate: source.perAssociate,
    lastWeekCheck: source.lastWeekCheck,
    decisions: source.decisions,
    highlights: source.highlights,
    blockers: source.blockers,
  };
}

/** Saved brief vs. a job's draft: show whichever is newer. See the Daily Brief for the reasoning. */
function newest(dto: WeeklyBriefDTO): WeeklyBriefAiOutput {
  const draftIsNewer =
    dto.draft !== null &&
    dto.draftAt !== null &&
    (dto.savedAt === null || dto.draftAt > dto.savedAt);
  return draftIsNewer && dto.draft !== null ? dto.draft : dto;
}

/**
 * Weekly Brief (Wave 5.1, legacy `weekly_brief_generate`/`weekly_brief_save`/`weekly_brief_patterns`).
 * KPI ribbon + scorecards + accountability + decisions + AI Patterns + branded print. The legacy
 * rolling-window Anomalies/Funnel/Trends block is deliberately NOT ported here — it belongs to
 * Wave 5.2 (Reports + Analytics), which owns real time-analysis reporting.
 *
 * `initial`/`initialWeekStart`/`initialTz` (perf audit 2026-08-05): `page.tsx` seeds these from
 * an `app-tz` cookie this component writes below (shared with `/daily-log`). If the browser's
 * LIVE tz offset matches what the server used to compute `initial`, the first client fetch is
 * skipped entirely — otherwise (no cookie yet, DST shift, travel) it falls back to the original
 * fetch-on-mount behavior.
 */
export function WeeklyBriefView({
  initial,
  initialWeekStart,
  initialTz,
}: {
  initial?: WeeklyBriefDTO | null;
  initialWeekStart?: string;
  initialTz?: number;
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart ?? mondayOf(dateKey()));
  const [saved, setSaved] = useState<WeeklyBriefDTO | null | undefined>(
    initialWeekStart !== undefined ? (initial ?? null) : undefined,
  );
  const [draft, setDraft] = useState<Draft | null>(
    initial ? toDraft(newest(initial), initial.weekStart) : null,
  );
  const [patterns, setPatterns] = useState<PostBriefsWeeklyPatternsResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [findingPatterns, setFindingPatterns] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const tz = new Date().getTimezoneOffset();
  const skipNextRefresh = useRef(initialWeekStart !== undefined && initialTz === tz);

  const refresh = useCallback(async () => {
    setSaved(undefined);
    setDraft(null);
    setPatterns(null);
    const res = await getJson<GetBriefsWeeklyResponse>(`/api/briefs/weekly?weekStart=${weekStart}`);
    if (res.ok) {
      setSaved(res.data);
      if (res.data) setDraft(toDraft(newest(res.data), weekStart));
    }
  }, [weekStart]);

  useEffect(() => {
    if (skipNextRefresh.current) {
      skipNextRefresh.current = false;
      return;
    }
    void refresh();
  }, [refresh]);

  useTzCookieSync(tz);

  /** Queue the generation, then wait for the job's draft — see the Daily Brief for why. */
  async function generate() {
    setGenerating(true);
    const previousDraftAt = saved?.draftAt ?? null;
    const res = await postJson<PostBriefsWeeklyGenerateResponse>("/api/briefs/weekly/generate", {
      weekStart,
      tz,
    });
    if (!res.ok) {
      setGenerating(false);
      toast.error(messageForFailure(res.failure));
      return;
    }
    const fresh = await awaitBriefDraft<WeeklyBriefAiOutput>(
      `/api/briefs/weekly?weekStart=${weekStart}`,
      previousDraftAt,
    );
    setGenerating(false);
    if (fresh) setDraft(toDraft(fresh, weekStart));
    else toast.error("The brief is still generating — reopen this tab shortly to pick it up.");
  }

  async function findPatterns() {
    setFindingPatterns(true);
    const res = await postJson<PostBriefsWeeklyPatternsResponse>("/api/briefs/weekly/patterns", {
      weekStart,
      tz,
    });
    setFindingPatterns(false);
    if (res.ok) setPatterns(res.data);
    else toast.error(messageForFailure(res.failure));
  }

  async function save() {
    if (!draft) return;
    setSavingBrief(true);
    const res = await postJson<PostBriefsWeeklySaveResponse>("/api/briefs/weekly/save", {
      ...draft,
      weekStart,
    });
    setSavingBrief(false);
    if (res.ok) {
      toast.success("Weekly Brief saved");
      setSaved(res.data);
    } else toast.error(messageForFailure(res.failure));
  }

  function print() {
    window.print();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card as="section" className="flex flex-wrap items-end gap-4 p-5 print:hidden">
        <Field label="Week of (Monday)" htmlFor="wb-week">
          <Input
            id="wb-week"
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(mondayOf(e.target.value))}
          />
        </Field>
        <Button type="button" loading={generating} onClick={() => void generate()}>
          {saved ? "Regenerate" : "Generate"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={findingPatterns}
          onClick={() => void findPatterns()}
        >
          Find Patterns
        </Button>
        {draft ? (
          <Button type="button" variant="ghost" onClick={print}>
            Print
          </Button>
        ) : null}
      </Card>

      {saved === null && !draft ? (
        <p className="text-sm text-gray italic">
          No brief saved for the week of {weekStart} yet — generate one above.
        </p>
      ) : null}

      {draft ? (
        <Card as="section" className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-charcoal">{draft.headline}</h2>
            <Button
              type="button"
              variant="success"
              size="sm"
              loading={savingBrief}
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
          {saved?.savedAt ? (
            <p className="text-xs text-gray print:hidden">
              Last saved {new Date(saved.savedAt).toLocaleString()}
              {saved.savedByName ? ` by ${saved.savedByName}` : ""}
            </p>
          ) : null}

          <p className="text-sm text-charcoal">{draft.kpiNarrative}</p>

          {draft.clientCards.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
                Clients
              </h3>
              <ul className="flex flex-col gap-1 text-sm text-charcoal">
                {draft.clientCards.map((c, i) => (
                  <li key={i}>
                    <span className="font-semibold">{c.clientName}:</span> {c.summary}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
              Per associate
            </h3>
            <ul className="flex flex-col gap-1 text-sm text-charcoal">
              {draft.perAssociate.map((a, i) => (
                <li key={i}>
                  <span className="font-semibold">{a.name}:</span> {a.summary}
                </li>
              ))}
              {draft.perAssociate.length === 0 ? (
                <li className="text-gray italic">No associate activity this week.</li>
              ) : null}
            </ul>
          </section>

          {draft.lastWeekCheck.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
                Last week check
              </h3>
              <ul className="flex flex-col gap-1 text-sm text-charcoal">
                {draft.lastWeekCheck.map((c, i) => (
                  <li key={i}>
                    <span className="font-semibold">{c.item}:</span> {c.status}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {draft.decisions.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
                Decisions
              </h3>
              <ul className="flex flex-col gap-1 text-sm text-charcoal">
                {draft.decisions.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-green uppercase">
                Highlights
              </h3>
              <p className="text-sm text-charcoal whitespace-pre-wrap">{draft.highlights}</p>
            </section>
            <section>
              <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-orange uppercase">
                Blockers
              </h3>
              <p className="text-sm text-charcoal whitespace-pre-wrap">{draft.blockers}</p>
            </section>
          </div>
        </Card>
      ) : null}

      {patterns ? (
        <Card as="section" className="flex flex-col gap-3 p-5 print:hidden">
          <h2 className="text-sm font-bold tracking-wide text-navy uppercase">
            Patterns (last 4 weeks)
          </h2>
          <ul className="flex flex-col gap-3">
            {patterns.patterns.map((p, i) => (
              <li key={i} className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-sm">
                <p className="font-semibold text-charcoal">{p.insight}</p>
                <p className="mt-1 text-gray">{p.evidence}</p>
                <p className="mt-1 font-medium text-navy">→ {p.action}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
