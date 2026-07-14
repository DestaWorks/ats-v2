"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { dateKey, mondayOf } from "@/lib/daily";
import { BLOCKERS, type DailyLogViewDTO } from "@/lib/validation/daily";
import { getJson, postJson, messageForFailure, readFailure } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const FIELDS = [
  ["sourced", "Profiles Sourced"],
  ["outreach", "Outreach Sent"],
  ["responses", "Responses"],
  ["screenings", "Screenings"],
  ["submitted", "To Client"],
] as const;

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

  const tiles: [string, number][] = [
    ["Added (auto)", auto.added],
    ["Moves (auto)", auto.moved],
    ["Notes (auto)", auto.notes],
    ["Verified (auto)", auto.verified],
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Ramp phase + streak (legacy phase banner + 🔥 badge). */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy/20 bg-navy/5 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-navy">{ramp.label}</p>
          <p className="text-xs text-gray">
            Week {ramp.weekNum} · daily targets: {ramp.sourced} sourced · {ramp.outreach} outreach ·{" "}
            {ramp.responses} responses · {ramp.screenings} screenings · {ramp.submitted} to client
          </p>
        </div>
        {streak > 0 ? (
          <Badge tone="amber" className="text-xs">
            🔥 {streak}-day streak
          </Badge>
        ) : null}
      </section>

      {/* Live shift tracker (auto-captured from the ATS). */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={label} className="p-3 text-center">
            <p className="font-serif text-2xl font-semibold text-charcoal">{value}</p>
            <p className="text-[11px] font-semibold tracking-wide text-gray uppercase">{label}</p>
          </Card>
        ))}
      </section>

      {/* Self-report — once per day (submitted state is read-only, legacy parity). */}
      <Card as="section" className="p-5">
        <h2 className="mb-3 text-sm font-bold tracking-wide text-navy uppercase">
          Today&apos;s log
        </h2>
        {log ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-green">Today&apos;s log submitted ✓</p>
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
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {FIELDS.map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  htmlFor={`dl-${key}`}
                  hint={
                    key === "sourced" && auto.added > 0 ? `Auto: ${auto.added} from ATS` : undefined
                  }
                >
                  <Input
                    id={`dl-${key}`}
                    type="number"
                    min={0}
                    max={999}
                    placeholder={key === "sourced" && auto.added > 0 ? String(auto.added) : "0"}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </Field>
              ))}
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
          <h2 className="mb-3 text-sm font-bold tracking-wide text-navy uppercase">
            This week&apos;s goals
          </h2>
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
              <li className="text-sm text-gray">No goals yet this week.</li>
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
            {entries.length === 0 ? <li className="text-sm text-gray">No notes yet.</li> : null}
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
            {history.map((l) => (
              <li
                key={l.date}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="font-semibold text-charcoal tabular-nums">{l.date}</span>
                <span className="text-gray">
                  {l.sourced} sourced · {l.outreach} outreach · {l.responses} responses ·{" "}
                  {l.screenings} screens · {l.submitted} to client
                </span>
                <span className={l.sourced >= ramp.sourced ? "text-green" : "text-orange"}>
                  {l.sourced >= ramp.sourced ? "✓ target" : "under"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
