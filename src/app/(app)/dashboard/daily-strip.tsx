"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { dateKey, paceStatus } from "@/lib/daily";
import type { DailyOverviewDTO } from "@/lib/validation/daily";
import { getJson, postJson, messageForFailure } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

/** Legacy priority-state options (mgr modal). */
const PRIORITY_STATES = ["CT", "NJ", "FL", "MA", "NY", "PA", "Other"];

const PACE_COLOR = { hit: "text-green", "on pace": "text-navy", behind: "text-orange" } as const;

/**
 * The Overview daily strip (legacy TODAY'S TARGETS + "No targets" banner). Client component —
 * "today" is the USER-LOCAL date, so it fetches `/api/daily/overview?date&tz` on mount. With no
 * target: the amber banner (leadership gets the "Set targets →" button; legacy sent them to the
 * Daily Brief). With a target: five metric cards (serif actual / target + 9–5 pace status) plus
 * priority/watch lines and the End-of-Shift flow (pre-filled from live actuals).
 */
export function DailyStrip() {
  const [data, setData] = useState<DailyOverviewDTO | null>(null);
  const [open, setOpen] = useState<"eos" | "targets" | null>(null);
  const today = dateKey();
  const tz = new Date().getTimezoneOffset();

  const refresh = useCallback(async () => {
    const res = await getJson<DailyOverviewDTO>(`/api/daily/overview?date=${today}&tz=${tz}`);
    if (res.ok) setData(res.data);
  }, [today, tz]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!data) return null;
  const { target, live, actualSubmitted, canSetTargets } = data;

  const hour = new Date().getHours();
  const metric = (label: string, actual: number, t: number) => {
    const status = paceStatus(actual, t, hour);
    return (
      <div key={label} className="min-w-24 rounded-lg bg-black/[0.03] px-3 py-2">
        <p className="text-[10px] font-bold tracking-[0.08em] text-gray uppercase">{label}</p>
        <p className="mt-0.5">
          <span className="font-serif text-xl font-semibold text-charcoal">{actual}</span>
          <span className="text-sm text-gray"> / {t}</span>
        </p>
        <p className={cn("text-[11px] font-semibold", PACE_COLOR[status])}>{status}</p>
      </div>
    );
  };

  return (
    <>
      {!target ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-orange/60 bg-orange/10 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-orange">No targets set for today yet.</p>
            <p className="text-xs text-gray">
              {canSetTargets
                ? "Set today's targets so the team knows what to hit."
                : "Your manager sets targets each morning — check back soon."}
            </p>
          </div>
          {canSetTargets ? (
            <Button type="button" size="sm" onClick={() => setOpen("targets")}>
              Set targets →
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
              Today&apos;s targets ·{" "}
              {new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
              {target.setByName ? ` · set by ${target.setByName}` : ""}
            </p>
            <div className="flex items-center gap-2">
              {canSetTargets ? (
                <Button type="button" size="xs" variant="ghost" onClick={() => setOpen("targets")}>
                  Edit targets
                </Button>
              ) : null}
              {actualSubmitted ? (
                <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-semibold text-green">
                  Shift logged ✓
                </span>
              ) : (
                <Button type="button" size="sm" onClick={() => setOpen("eos")}>
                  End of Shift →
                </Button>
              )}
            </div>
          </div>

          {target.priorityClientName || target.priorityRole || target.priorityState ? (
            <p className="text-xs text-charcoal">
              <span className="font-semibold">Priority:</span>{" "}
              {[target.priorityClientName, target.priorityRole, target.priorityState]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {target.watchFor ? (
            <p className="text-xs text-charcoal">
              <span className="font-semibold">Watch for:</span> {target.watchFor}
            </p>
          ) : null}
          {target.notesFromYesterday ? (
            <p className="text-xs text-gray italic">{target.notesFromYesterday}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {metric("Sourcing", live.sourcing, target.sourcing)}
            {metric("Outreach", live.outreach, target.outreach)}
            {metric("ATS Cleanup", live.atsCleanup, target.atsCleanup)}
            {/* Inbound/Screens have no live counter (legacy parity) — shown only when targeted. */}
            {target.inbound > 0 ? metric("Inbound", 0, target.inbound) : null}
            {target.screens > 0 ? metric("Screens", 0, target.screens) : null}
          </div>
        </section>
      )}

      {open === "eos" ? (
        <EndOfShiftModal
          today={today}
          data={data}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void refresh();
          }}
        />
      ) : null}
      {open === "targets" && canSetTargets ? (
        <SetTargetsModal
          today={today}
          data={data}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}

const EOS_FIELDS = [
  ["sourcing", "Sourcing"],
  ["outreach", "Outreach"],
  ["atsCleanup", "ATS Cleanup"],
  ["inbound", "Inbound"],
  ["screens", "Screens"],
] as const;

function EndOfShiftModal({
  today,
  data,
  onClose,
  onSaved,
}: {
  today: string;
  data: DailyOverviewDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Pre-filled from the live counts (legacy: "Numbers pre-filled from your activity log.").
  const [form, setForm] = useState<Record<string, string>>({
    sourcing: String(data.live.sourcing),
    outreach: String(data.live.outreach),
    atsCleanup: String(data.live.atsCleanup),
    inbound: "",
    screens: "",
    note: "",
    shiftHandoff: "",
  });
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const res = await postJson("/api/daily/actuals", {
      date: today,
      sourcing: Number(form.sourcing) || 0,
      outreach: Number(form.outreach) || 0,
      atsCleanup: Number(form.atsCleanup) || 0,
      inbound: Number(form.inbound) || 0,
      screens: Number(form.screens) || 0,
      note: (form.note ?? "").trim() || null,
      shiftHandoff: (form.shiftHandoff ?? "").trim() || null,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Shift logged — see you tomorrow");
      onSaved();
    } else toast.error(messageForFailure(res.failure));
  }

  const t = data.target;
  return (
    <Modal open onClose={onClose} title={`End of Shift · ${today}`}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray">
          Log today&apos;s actuals — numbers are pre-filled from your activity.
        </p>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {EOS_FIELDS.map(([key, label]) => {
            const targetValue = t ? t[key] : 0;
            const value = Number(form[key]) || 0;
            return (
              <Field
                key={key}
                label={`${label}${targetValue ? ` — target ${targetValue}` : ""}`}
                htmlFor={`eos-${key}`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    id={`eos-${key}`}
                    type="number"
                    min={0}
                    max={999}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                  {targetValue ? (
                    <span
                      aria-hidden
                      className={value >= targetValue ? "text-green" : "text-orange"}
                    >
                      {value >= targetValue ? "✓" : "⚠"}
                    </span>
                  ) : null}
                </div>
              </Field>
            );
          })}
        </div>
        <Field label="Note (optional)" htmlFor="eos-note">
          <Input
            id="eos-note"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <Field
          label="Shift handoff (optional)"
          htmlFor="eos-handoff"
          hint="Visible to the next shift"
        >
          <textarea
            id="eos-handoff"
            rows={2}
            value={form.shiftHandoff}
            onChange={(e) => setForm({ ...form, shiftHandoff: e.target.value })}
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
          />
        </Field>
        <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="success" loading={pending} onClick={() => void submit()}>
            Log Actuals
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SetTargetsModal({
  today,
  data,
  onClose,
  onSaved,
}: {
  today: string;
  data: DailyOverviewDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const teammates = data.teammates ?? [];
  const clients = data.clients ?? [];
  // Legacy AI-suggest fallback defaults: 25 / 25 / 5 / 0 / 0.
  const [form, setForm] = useState<Record<string, string>>({
    userId: teammates[0]?.id ?? "",
    sourcing: "25",
    outreach: "25",
    atsCleanup: "5",
    inbound: "0",
    screens: "0",
    priorityClientId: "",
    priorityRole: "",
    priorityState: "",
    notesFromYesterday: "",
    watchFor: "",
  });
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!form.userId) return;
    setPending(true);
    const res = await postJson("/api/daily/targets", {
      userId: form.userId,
      date: today,
      sourcing: Number(form.sourcing) || 0,
      outreach: Number(form.outreach) || 0,
      atsCleanup: Number(form.atsCleanup) || 0,
      inbound: Number(form.inbound) || 0,
      screens: Number(form.screens) || 0,
      priorityClientId: form.priorityClientId || null,
      priorityRole: (form.priorityRole ?? "").trim() || null,
      priorityState: form.priorityState || null,
      notesFromYesterday: (form.notesFromYesterday ?? "").trim() || null,
      watchFor: (form.watchFor ?? "").trim() || null,
    });
    setPending(false);
    if (res.ok) {
      toast.success("Targets set");
      onSaved();
    } else toast.error(messageForFailure(res.failure));
  }

  const set =
    (key: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Modal open onClose={onClose} title={`Set targets · ${today}`}>
      <div className="flex flex-col gap-4">
        <Field label="Associate" htmlFor="tg-user" required>
          <Select id="tg-user" value={form.userId} onChange={set("userId")}>
            {teammates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {EOS_FIELDS.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`tg-${key}`}>
              <Input
                id={`tg-${key}`}
                type="number"
                min={0}
                max={999}
                value={form[key]}
                onChange={set(key)}
              />
            </Field>
          ))}
        </div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Priority client" htmlFor="tg-client">
            <Select id="tg-client" value={form.priorityClientId} onChange={set("priorityClientId")}>
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority state" htmlFor="tg-state">
            <Select id="tg-state" value={form.priorityState} onChange={set("priorityState")}>
              <option value="">Select…</option>
              {PRIORITY_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Priority role (optional)" htmlFor="tg-role">
          <Input id="tg-role" value={form.priorityRole} onChange={set("priorityRole")} />
        </Field>
        <Field label="Notes from yesterday (optional)" htmlFor="tg-notes">
          <textarea
            id="tg-notes"
            rows={2}
            value={form.notesFromYesterday}
            onChange={set("notesFromYesterday")}
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
          />
        </Field>
        <Field label="Watch for (optional)" htmlFor="tg-watch">
          <Input id="tg-watch" value={form.watchFor} onChange={set("watchFor")} />
        </Field>
        <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="success"
            loading={pending}
            disabled={!form.userId}
            onClick={() => void submit()}
          >
            Set Targets
          </Button>
        </div>
      </div>
    </Modal>
  );
}
