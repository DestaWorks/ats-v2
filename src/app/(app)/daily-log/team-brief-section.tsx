"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { dateKey } from "@/lib/daily";
import type { DailyBriefDTO } from "@/lib/validation/briefs";
import type { DailyOverviewDTO } from "@/lib/validation/daily";
import { getJson, messageForFailure, postJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** The editable draft — the AI output fields, held client-side between generate → save. */
type Draft = Omit<DailyBriefDTO, "priorityClientId" | "savedByName" | "savedAt">;

/** Plain-text export (legacy's Slack/email-friendly format — Copy button, no fake integration). */
function toPlainText(draft: Draft): string {
  const lines = [
    `DAILY BRIEF · ${draft.date}`,
    "",
    draft.headline,
    "",
    "EXCEPTIONS",
    ...draft.exceptions.map((e) => `- ${e}`),
  ];
  if (draft.yesterdayCheck.length > 0) {
    lines.push(
      "",
      "YESTERDAY CHECK",
      ...draft.yesterdayCheck.map((y) => `- ${y.associate}: ${y.note}`),
    );
  }
  if (draft.clientCards.length > 0) {
    lines.push("", "CLIENTS", ...draft.clientCards.map((c) => `- ${c.clientName}: ${c.summary}`));
  }
  lines.push(
    "",
    "PER ASSOCIATE",
    ...draft.perAssociate.flatMap((a) => [`${a.name}:`, ...a.todos.map((t) => `  - ${t}`)]),
  );
  lines.push("", "TEAM PULSE", draft.teamPulse);
  return lines.join("\n");
}

/**
 * Team Brief — the AI-generated, leadership-facing daily summary (formerly the standalone
 * `/daily-brief` page; folded into Daily Log 2026-08-04 so there's one destination instead of two
 * same-shaped nav items). Only ever mounted inside Daily Log's "Team" tab, which `DailyLogView`
 * only includes when the server-computed `canViewTeam` prop is true — no client-side capability
 * plumbing here; the brief routes still double-gate (`viewReports`) as the real check.
 */
export function TeamBriefSection() {
  const [date, setDate] = useState(dateKey());
  const [overview, setOverview] = useState<DailyOverviewDTO | null>(null);
  const [saved, setSaved] = useState<DailyBriefDTO | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState({
    priorityClientId: "",
    shiftA: "",
    shiftB: "",
    watchItems: "",
  });
  const [generating, setGenerating] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const tz = new Date().getTimezoneOffset();

  const refresh = useCallback(async () => {
    setSaved(undefined);
    setDraft(null);
    const [ov, res] = await Promise.all([
      getJson<DailyOverviewDTO>(`/api/daily/overview?date=${date}&tz=${tz}`),
      getJson<DailyBriefDTO | null>(`/api/briefs/daily?date=${date}`),
    ]);
    if (ov.ok) setOverview(ov.data);
    if (res.ok) {
      setSaved(res.data);
      if (res.data) {
        setDraft({ ...res.data });
        setManual({
          priorityClientId: res.data.priorityClientId ?? "",
          shiftA: res.data.shiftA ?? "",
          shiftB: res.data.shiftB ?? "",
          watchItems: res.data.watchItems ?? "",
        });
      }
    }
  }, [date, tz]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generate() {
    setGenerating(true);
    const res = await postJson<Draft>("/api/briefs/daily/generate", {
      date,
      tz,
      priorityClientId: manual.priorityClientId || null,
      shiftA: manual.shiftA.trim() || null,
      shiftB: manual.shiftB.trim() || null,
      watchItems: manual.watchItems.trim() || null,
    });
    setGenerating(false);
    if (res.ok) setDraft({ ...res.data, date });
    else toast.error(messageForFailure(res.failure));
  }

  async function save() {
    if (!draft) return;
    setSavingBrief(true);
    const res = await postJson<DailyBriefDTO>("/api/briefs/daily/save", {
      ...draft,
      date,
      priorityClientId: manual.priorityClientId || null,
      shiftA: manual.shiftA.trim() || null,
      shiftB: manual.shiftB.trim() || null,
      watchItems: manual.watchItems.trim() || null,
    });
    setSavingBrief(false);
    if (res.ok) {
      toast.success("Daily Brief saved");
      setSaved(res.data);
    } else toast.error(messageForFailure(res.failure));
  }

  function copyText() {
    if (!draft) return;
    void navigator.clipboard.writeText(toPlainText(draft));
    toast.success("Copied — paste it into Slack or email");
  }

  const clients = overview?.clients ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-wide text-navy uppercase">
        Today&apos;s team brief
      </h2>

      <Card as="section" className="flex flex-wrap items-end gap-4 p-5">
        <Field label="Date" htmlFor="db-date">
          <Input id="db-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Priority client" htmlFor="db-client">
          <Select
            id="db-client"
            value={manual.priorityClientId}
            onChange={(e) => setManual({ ...manual, priorityClientId: e.target.value })}
          >
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Shift A note" htmlFor="db-shifta">
          <Input
            id="db-shifta"
            value={manual.shiftA}
            onChange={(e) => setManual({ ...manual, shiftA: e.target.value })}
          />
        </Field>
        <Field label="Shift B note" htmlFor="db-shiftb">
          <Input
            id="db-shiftb"
            value={manual.shiftB}
            onChange={(e) => setManual({ ...manual, shiftB: e.target.value })}
          />
        </Field>
        <Field label="Watch items" htmlFor="db-watch">
          <Input
            id="db-watch"
            value={manual.watchItems}
            onChange={(e) => setManual({ ...manual, watchItems: e.target.value })}
          />
        </Field>
        <Button type="button" loading={generating} onClick={() => void generate()}>
          {saved ? "Regenerate" : "Generate"}
        </Button>
      </Card>

      {saved === null && !draft ? (
        <p className="text-sm text-gray italic">
          No brief saved for {date} yet — generate one above.
        </p>
      ) : null}

      {draft ? (
        <Card as="section" className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-bold text-charcoal">{draft.headline}</h3>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={copyText}>
                Copy
              </Button>
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
          </div>
          {saved?.savedAt ? (
            <p className="text-xs text-gray">
              Last saved {new Date(saved.savedAt).toLocaleString()}
              {saved.savedByName ? ` by ${saved.savedByName}` : ""}
            </p>
          ) : null}

          <section>
            <h4 className="mb-1.5 text-[11px] font-bold tracking-wide text-orange uppercase">
              Exceptions
            </h4>
            <ul className="flex flex-col gap-1 text-sm text-charcoal">
              {draft.exceptions.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
              {draft.exceptions.length === 0 ? <li className="text-gray italic">None</li> : null}
            </ul>
          </section>

          {draft.yesterdayCheck.length > 0 ? (
            <section>
              <h4 className="mb-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
                Yesterday check
              </h4>
              <ul className="flex flex-col gap-1 text-sm text-charcoal">
                {draft.yesterdayCheck.map((y, i) => (
                  <li key={i}>
                    <span className="font-semibold">{y.associate}:</span> {y.note}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {draft.clientCards.length > 0 ? (
            <section>
              <h4 className="mb-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
                Clients
              </h4>
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
            <h4 className="mb-1.5 text-[11px] font-bold tracking-wide text-gray uppercase">
              Per associate
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {draft.perAssociate.map((a, i) => (
                <div key={i} className="rounded-lg border border-black/5 bg-black/[0.02] p-3">
                  <p className="text-sm font-semibold text-charcoal">{a.name}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray">
                    {a.todos.map((t, j) => (
                      <li key={j}>• {t}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {draft.perAssociate.length === 0 ? (
                <p className="text-sm text-gray italic">No associate activity today.</p>
              ) : null}
            </div>
          </section>

          <p className="border-t border-black/5 pt-3 text-sm text-charcoal italic">
            {draft.teamPulse}
          </p>
        </Card>
      ) : null}
    </section>
  );
}
