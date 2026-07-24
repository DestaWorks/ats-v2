"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { dateKey, mondayOf } from "@/lib/daily";
import type { WeeklyBriefDTO, WeeklyPatternsAiOutput } from "@/lib/validation/briefs";
import { getJson, messageForFailure, postJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Draft = Omit<WeeklyBriefDTO, "savedByName" | "savedAt">;

/**
 * Weekly Brief (Wave 5.1, legacy `weekly_brief_generate`/`weekly_brief_save`/`weekly_brief_patterns`).
 * KPI ribbon + scorecards + accountability + decisions + AI Patterns + branded print. The legacy
 * rolling-window Anomalies/Funnel/Trends block is deliberately NOT ported here — it belongs to
 * Wave 5.2 (Reports + Analytics), which owns real time-analysis reporting.
 */
export function WeeklyBriefView() {
  const [weekStart, setWeekStart] = useState(mondayOf(dateKey()));
  const [saved, setSaved] = useState<WeeklyBriefDTO | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [patterns, setPatterns] = useState<WeeklyPatternsAiOutput | null>(null);
  const [generating, setGenerating] = useState(false);
  const [findingPatterns, setFindingPatterns] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const tz = new Date().getTimezoneOffset();

  const refresh = useCallback(async () => {
    setSaved(undefined);
    setDraft(null);
    setPatterns(null);
    const res = await getJson<WeeklyBriefDTO | null>(`/api/briefs/weekly?weekStart=${weekStart}`);
    if (res.ok) {
      setSaved(res.data);
      if (res.data) setDraft({ ...res.data });
    }
  }, [weekStart]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generate() {
    setGenerating(true);
    const res = await postJson<Draft>("/api/briefs/weekly/generate", { weekStart, tz });
    setGenerating(false);
    if (res.ok) setDraft({ ...res.data, weekStart });
    else toast.error(messageForFailure(res.failure));
  }

  async function findPatterns() {
    setFindingPatterns(true);
    const res = await postJson<WeeklyPatternsAiOutput>("/api/briefs/weekly/patterns", {
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
    const res = await postJson<WeeklyBriefDTO>("/api/briefs/weekly/save", { ...draft, weekStart });
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
