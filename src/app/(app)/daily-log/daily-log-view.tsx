"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { dateKey, mondayOf } from "@/lib/daily";
import { BLOCKERS, type DailyLogViewDTO } from "@/lib/validation/daily";
import { getJson, postJson, messageForFailure, readFailure } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

const FIELDS = [
  ["sourced", "Profiles Sourced"],
  ["outreach", "Outreach Sent"],
  ["responses", "Responses"],
  ["screenings", "Screenings"],
  ["submitted", "To Client"],
] as const;

/** The 3 tenure-ramp phases, in order — mirrors `rampFor`'s own week thresholds (`lib/daily.ts`). */
const RAMP_PHASES = [
  { name: "Training", weeks: [1, 2] },
  { name: "Ramp", weeks: [3, 4] },
  { name: "Full Production", weeks: [5, Infinity] },
] as const;

/** Which phase (0-2) `weekNum` falls in, and how far through that phase it is (0–1). */
function rampProgress(weekNum: number): { phaseIndex: number; fraction: number } {
  if (weekNum <= 2) return { phaseIndex: 0, fraction: weekNum / 2 };
  if (weekNum <= 4) return { phaseIndex: 1, fraction: (weekNum - 2) / 2 };
  return { phaseIndex: 2, fraction: 1 };
}

/** A small filled/outline dot — the "hit vs. under" and status idiom used across the app's tables. */
function Dot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} />
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-4 w-4">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The 3-segment ramp journey track — the signature element: it visualizes the actual onboarding
 * arc (Training → Ramp → Full Production), not a decorative progress bar. */
function RampTrack({ weekNum }: { weekNum: number }) {
  const { phaseIndex, fraction } = rampProgress(weekNum);
  return (
    <div className="flex items-center gap-1.5">
      {RAMP_PHASES.map((phase, i) => {
        const state = i < phaseIndex ? "done" : i === phaseIndex ? "current" : "upcoming";
        return (
          <div key={phase.name} className="flex flex-1 flex-col gap-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  state === "upcoming" ? "bg-transparent" : "bg-brand",
                )}
                style={{
                  width:
                    state === "done"
                      ? "100%"
                      : state === "current"
                        ? `${Math.max(fraction, 0.12) * 100}%`
                        : "0%",
                }}
              />
            </div>
            <span
              className={cn(
                "text-[10px] font-semibold tracking-wide uppercase",
                state === "current"
                  ? "text-brand"
                  : state === "done"
                    ? "text-charcoal/60"
                    : "text-gray/50",
              )}
            >
              {phase.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type TileLabel = "Added (auto)" | "Moves (auto)" | "Notes (auto)" | "Verified (auto)";

/** Icon mirrors legacy's own tile icons (🔍/➡/📝/✓) — one accent per auto-captured metric. */
const TILE_META: Record<TileLabel, { icon: string; bar: string; badge: string; tint: string }> = {
  "Added (auto)": {
    icon: "🔍",
    bar: "bg-navy",
    badge: "bg-navy/10 text-navy",
    tint: "bg-navy/[0.025]",
  },
  "Moves (auto)": {
    icon: "➡️",
    bar: "bg-purple",
    badge: "bg-purple/10 text-purple",
    tint: "bg-purple/[0.025]",
  },
  "Notes (auto)": {
    icon: "📝",
    bar: "bg-teal",
    badge: "bg-teal/10 text-teal",
    tint: "bg-teal/[0.025]",
  },
  "Verified (auto)": {
    icon: "✓",
    bar: "bg-green",
    badge: "bg-green/10 text-green",
    tint: "bg-green/[0.025]",
  },
};

/**
 * The Daily Log & Journal composite (legacy `dailylog` + `journal` views): tenure-ramp phase
 * banner + 🔥 streak, live auto-capture tiles, the once-a-day self-report (sourced pre-filled
 * from the ATS count), log history, and the journal (weekly goals with REAL toggles + daily
 * notes). Loads `GET /api/daily/log?date&tz` (user-local day) and refetches after each write.
 */
export function DailyLogView() {
  const [view, setView] = useState<DailyLogViewDTO | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    sourced: "",
    outreach: "",
    responses: "",
    screenings: "",
    submitted: "",
    blocker: "",
    notes: "",
    shiftHandoff: "",
  });
  const [goalText, setGoalText] = useState("");
  const [entryText, setEntryText] = useState("");
  const [pending, setPending] = useState(false);
  const today = dateKey();
  const tz = new Date().getTimezoneOffset();

  const refresh = useCallback(async () => {
    const res = await getJson<DailyLogViewDTO>(`/api/daily/log?date=${today}&tz=${tz}`);
    if (res.ok) setView(res.data);
  }, [today, tz]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!view) return <p className="text-sm text-gray">Loading…</p>;
  const { log, auto, ramp, streak, history, goals, entries } = view;

  async function submitLog() {
    setPending(true);
    const res = await postJson("/api/daily/log", {
      date: today,
      tz,
      sourced: Number(form.sourced) || auto.added || 0,
      outreach: Number(form.outreach) || 0,
      responses: Number(form.responses) || 0,
      screenings: Number(form.screenings) || 0,
      submitted: Number(form.submitted) || 0,
      blocker: form.blocker || null,
      notes: (form.notes ?? "").trim() || null,
      shiftHandoff: (form.shiftHandoff ?? "").trim() || null,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Daily log submitted");
      void refresh();
    } else toast.error(messageForFailure(res.failure));
  }

  async function addGoal() {
    if (!goalText.trim()) return;
    const res = await postJson("/api/daily/journal/goals", {
      weekStart: mondayOf(today),
      text: goalText.trim(),
    });
    if (res.ok) {
      setGoalText("");
      void refresh();
    } else toast.error(messageForFailure(res.failure));
  }

  async function toggleGoal(id: string, done: boolean) {
    const res = await fetch(`/api/daily/journal/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (res.ok) void refresh();
    else toast.error(messageForFailure(await readFailure(res)));
  }

  async function addEntry() {
    if (!entryText.trim()) return;
    const res = await postJson("/api/daily/journal/entries", {
      date: today,
      text: entryText.trim(),
    });
    if (res.ok) {
      setEntryText("");
      void refresh();
    } else toast.error(messageForFailure(res.failure));
  }

  const tiles: [TileLabel, number][] = [
    ["Added (auto)", auto.added],
    ["Moves (auto)", auto.moved],
    ["Notes (auto)", auto.notes],
    ["Verified (auto)", auto.verified],
  ];
  const goalsDone = goals.filter((g) => g.done).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Ramp journey — the signature: a 3-segment track showing the real onboarding arc, not a
          decorative bar (Training → Ramp → Full Production, per `lib/daily.ts` rampFor). */}
      <section className="flex flex-col gap-3 rounded-xl border border-brand/25 bg-linear-to-r from-brand/[0.07] via-white to-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-serif text-lg font-bold text-charcoal">{ramp.label}</p>
            <p className="mt-0.5 text-xs text-gray">
              Week {ramp.weekNum} · daily targets: {ramp.sourced} sourced · {ramp.outreach} outreach
              · {ramp.responses} responses · {ramp.screenings} screenings · {ramp.submitted} to
              client
            </p>
          </div>
          {streak > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-purple/10 px-3 py-1 text-sm font-bold text-purple">
              🔥 {streak}-day streak
            </span>
          ) : null}
        </div>
        <RampTrack weekNum={ramp.weekNum} />
      </section>

      {/* Live shift tracker (auto-captured from the ATS) — an icon badge + accent per metric
          (mirrors legacy's own icon tiles) instead of four cramped, identical boxes. */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map(([label, value]) => {
          const meta = TILE_META[label];
          return (
            <Card
              key={label}
              className={cn("overflow-hidden p-0 transition hover:shadow-sm", meta.tint)}
            >
              <div className={cn("h-1", meta.bar)} />
              <div className="flex items-center gap-4 p-5">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg",
                    meta.badge,
                  )}
                >
                  {meta.icon}
                </span>
                <div>
                  <p className="font-serif text-3xl leading-none font-bold text-charcoal">
                    {value}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold tracking-wide text-gray uppercase">
                    {label}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {/* Self-report — once per day (submitted state is read-only, legacy parity). */}
      <Card as="section" className="p-5">
        <h2 className="mb-3 text-sm font-bold tracking-wide text-navy uppercase">
          Today&apos;s log
        </h2>
        {log ? (
          <div className="flex flex-col gap-3 rounded-lg border border-green/20 bg-green/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-green">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green text-white">
                <CheckIcon />
              </span>
              Today&apos;s log submitted
            </p>
            <p className="text-sm text-charcoal">
              {FIELDS.map(([key, label]) => `${label}: ${log[key]}`).join(" · ")}
            </p>
            {log.blocker ? <p className="text-sm text-orange">Blocker: {log.blocker}</p> : null}
            {log.notes ? (
              <p className="text-sm whitespace-pre-wrap text-gray">{log.notes}</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Density mirrors legacy's `repeat(5,1fr)` KPI grid — at full page width, MORE narrow
                columns keep each number input compact instead of a few columns stretching wide. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
              {FIELDS.map(([key, label]) => {
                const autoFilled = key === "sourced" && auto.added > 0;
                return (
                  <Field
                    key={key}
                    label={
                      autoFilled ? (
                        <span className="inline-flex items-center gap-1.5">
                          {label}
                          <span className="rounded-full bg-label px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-navy uppercase">
                            Auto
                          </span>
                        </span>
                      ) : (
                        label
                      )
                    }
                    htmlFor={`dl-${key}`}
                    hint={autoFilled ? `Auto: ${auto.added} from ATS` : undefined}
                  >
                    <Input
                      id={`dl-${key}`}
                      type="number"
                      min={0}
                      max={999}
                      placeholder={autoFilled ? String(auto.added) : "0"}
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className={autoFilled ? "bg-label/40" : undefined}
                    />
                  </Field>
                );
              })}
              <Field label="Blocker (optional)" htmlFor="dl-blocker">
                <Select
                  id="dl-blocker"
                  value={form.blocker}
                  onChange={(e) => setForm({ ...form, blocker: e.target.value })}
                >
                  <option value="">None</option>
                  {BLOCKERS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes (optional)" htmlFor="dl-notes">
              <textarea
                id="dl-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
              />
            </Field>
            <Field
              label="Shift handoff (optional)"
              htmlFor="dl-handoff"
              hint="Visible to the next shift"
            >
              <Input
                id="dl-handoff"
                value={form.shiftHandoff}
                onChange={(e) => setForm({ ...form, shiftHandoff: e.target.value })}
              />
            </Field>
            <div className="flex justify-end border-t border-black/5 pt-4">
              <Button
                type="button"
                variant="success"
                loading={pending}
                onClick={() => void submitLog()}
              >
                Submit Daily Log
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Journal — weekly goals (real toggles) + daily notes. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card as="section" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide text-navy uppercase">
              This week&apos;s goals
            </h2>
            {goals.length > 0 ? (
              <span className="text-xs font-semibold text-gray tabular-nums">
                {goalsDone}/{goals.length} done
              </span>
            ) : null}
          </div>
          <ul className="flex flex-col gap-1.5">
            {goals.map((g) => (
              <li key={g.id}>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-navy"
                    checked={g.done}
                    onChange={(e) => void toggleGoal(g.id, e.target.checked)}
                  />
                  <span className={g.done ? "text-gray line-through" : ""}>{g.text}</span>
                </label>
              </li>
            ))}
            {goals.length === 0 ? (
              <li className="text-sm text-gray italic">No goals yet this week — add one below.</li>
            ) : null}
          </ul>
          <div className="mt-3 flex gap-2">
            <Input
              aria-label="New goal"
              placeholder="Add a goal for this week…"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addGoal();
              }}
            />
            <Button type="button" size="sm" onClick={() => void addGoal()}>
              Add
            </Button>
          </div>
        </Card>

        <Card as="section" className="p-5">
          <h2 className="mb-3 text-sm font-bold tracking-wide text-navy uppercase">Journal</h2>
          <div className="flex gap-2">
            <Input
              aria-label="Journal note"
              placeholder="What happened today…"
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addEntry();
              }}
            />
            <Button type="button" size="sm" onClick={() => void addEntry()}>
              Save
            </Button>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {entries.slice(0, 8).map((e) => (
              <li key={e.id} className="text-sm text-charcoal">
                <span className="mr-2 text-xs text-gray tabular-nums">{e.date}</span>
                <span className="whitespace-pre-wrap">{e.text}</span>
              </li>
            ))}
            {entries.length === 0 ? (
              <li className="text-sm text-gray italic">No notes yet — jot down how today went.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      {/* Log history (last 10). */}
      <Card as="section" className="p-5">
        <h2 className="mb-3 text-sm font-bold tracking-wide text-navy uppercase">Log history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray">No logs yet — submit your first one above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5">
            {history.map((l) => {
              const hit = l.sourced >= ramp.sourced;
              return (
                <li key={l.date} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <Dot className={hit ? "bg-green" : "bg-orange"} />
                  <span className="font-semibold text-charcoal tabular-nums">{l.date}</span>
                  <span className="flex-1 text-gray">
                    {l.sourced} sourced · {l.outreach} outreach · {l.responses} responses ·{" "}
                    {l.screenings} screens · {l.submitted} to client
                  </span>
                  <span className={cn("text-xs font-semibold", hit ? "text-green" : "text-orange")}>
                    {hit ? "target hit" : "under target"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
