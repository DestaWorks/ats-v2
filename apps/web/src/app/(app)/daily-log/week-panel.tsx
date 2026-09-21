"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { dateKey } from "@destaworks/domain/daily";
import type {
  DailyLogViewDTO,
  JournalGoalDTO,
  CreatedJournalGoalDTO,
  AcknowledgedDTO,
} from "@destaworks/contracts/validation/daily";
import { Button } from "@destaworks/ui/button";
import { Card } from "@destaworks/ui/card";
import { Input } from "@destaworks/ui/input";
import { getJson, patchJson, postJson, messageForFailure } from "@/lib/api/client";

/**
 * This week's goals, at the Week range.
 *
 * Lifted out of the day panel because it was the clearest case of the page contradicting its own
 * control: you would select Day and read a heading that said "this week". Goals are a weekly
 * commitment ticked off across the week, so they belong to the week.
 */
export function WeekPanel() {
  const [view, setView] = useState<DailyLogViewDTO | null>(null);
  const [goals, setGoals] = useState<JournalGoalDTO[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const today = dateKey();
  const tz = new Date().getTimezoneOffset();

  const refresh = useCallback(async () => {
    const res = await getJson<DailyLogViewDTO>(`/api/daily/log?date=${today}&tz=${tz}`);
    if (res.ok) {
      setView(res.data);
      setGoals(res.data.goals);
    }
  }, [today, tz]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addGoal() {
    const value = text.trim();
    if (value === "") return;
    setPending(true);
    const res = await postJson<CreatedJournalGoalDTO>("/api/daily/journal/goals", {
      date: today,
      text: value,
    });
    setPending(false);
    if (res.ok) {
      setText("");
      void refresh();
    } else toast.error(messageForFailure(res.failure));
  }

  async function toggleGoal(id: string, done: boolean) {
    const res = await patchJson<AcknowledgedDTO>(`/api/daily/journal/goals/${id}`, { done });
    if (res.ok) void refresh();
    else toast.error(messageForFailure(res.failure));
  }

  const done = goals.filter((g) => g.done).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {view !== null && (
        <Card as="section" className="p-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-navy uppercase">Pace</h2>
          <p className="text-sm text-charcoal">
            {view.weekTotals.sourced} sourced over {view.weekTotals.days}{" "}
            {view.weekTotals.days === 1 ? "day" : "days"} logged.
          </p>
          <p className="mt-1 text-sm text-gray">
            Need <span className="font-semibold text-charcoal">{view.pacing.neededPerDay}/day</span>{" "}
            to hit the weekly target · projected total:{" "}
            <span className="font-semibold text-charcoal">{view.pacing.projectedTotal}</span>
          </p>
        </Card>
      )}

      <Card as="section" className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wide text-navy uppercase">
            This week&apos;s goals
          </h2>
          {goals.length > 0 ? (
            <span className="text-xs font-semibold text-gray tabular-nums">
              {done}/{goals.length} done
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
            value={text}
            disabled={pending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addGoal();
            }}
          />
          <Button type="button" size="sm" loading={pending} onClick={() => void addGoal()}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
