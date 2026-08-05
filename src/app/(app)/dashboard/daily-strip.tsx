"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { dateKey, paceStatus } from "@/lib/daily";
import { useTzCookieSync } from "@/lib/use-tz-cookie-sync";
import type { DailyOverviewDTO } from "@/lib/validation/daily";
import type { TargetsSuggestAiOutput } from "@/lib/validation/briefs";
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
 *
 * `initial`/`initialTz` (perf audit 2026-08-05): `page.tsx` seeds these from the `app-tz` cookie
 * (shared with `/daily-log` and `/weekly-brief`). If the browser's LIVE tz offset matches what
 * the server used to compute `initial`, the first client fetch is skipped entirely — otherwise
 * (no cookie yet, DST shift, travel) it falls back to the original fetch-on-mount behavior.
 */
export function DailyStrip({
  initial,
  initialTz,
}: {
  initial?: DailyOverviewDTO;
  initialTz?: number;
}) {
  const [data, setData] = useState<DailyOverviewDTO | null>(initial ?? null);
  const [open, setOpen] = useState<"eos" | "targets" | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const today = dateKey();
  const tz = new Date().getTimezoneOffset();
  const skipNextRefresh = useRef(initial !== undefined && initialTz === tz);

  const refresh = useCallback(async () => {
    const res = await getJson<DailyOverviewDTO>(`/api/daily/overview?date=${today}&tz=${tz}`);
    if (res.ok) setData(res.data);
  }, [today, tz]);

  useEffect(() => {
    if (skipNextRefresh.current) {
      skipNextRefresh.current = false;
      return;
    }
    void refresh();
  }, [refresh]);

  useTzCookieSync(tz);

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
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setTargetUserId(null);
                setOpen("targets");
              }}
            >
              Set targets →
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white p-4 shadow-card">
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
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setTargetUserId(null);
                    setOpen("targets");
                  }}
                >
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

      {canSetTargets && data.teammates && data.teammates.length > 0 ? (
        <TargetRosterSection
          teammates={data.teammates}
          onPick={(id) => {
            setTargetUserId(id);
            setOpen("targets");
          }}
        />
      ) : null}

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
          initialUserId={targetUserId}
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
  const [perClientSourcing, setPerClientSourcing] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const eosClients = (data.clients ?? []).slice(0, 6);

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
      perClientSourcing: Object.fromEntries(
        Object.entries(perClientSourcing)
          .map(([id, v]) => [id, Number(v) || 0] as const)
          .filter(([, v]) => v > 0),
      ),
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
        {eosClients.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-gray uppercase">
              Sourced by client{" "}
              <span className="font-normal normal-case text-gray/70">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {eosClients.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-md bg-black/[0.03] px-2.5 py-1.5"
                >
                  <span className="flex-1 text-xs text-charcoal">{c.name.split(" ")[0]}</span>
                  <Input
                    id={`eos-pc-${c.id}`}
                    aria-label={`Sourced for ${c.name}`}
                    type="number"
                    min={0}
                    max={999}
                    value={perClientSourcing[c.id] ?? ""}
                    onChange={(e) =>
                      setPerClientSourcing({ ...perClientSourcing, [c.id]: e.target.value })
                    }
                    className="w-14 py-1 text-right text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
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

/**
 * "MANAGER · SET TODAY'S TARGETS" roster (design pass 2026-08-04, legacy `vw="brief"`'s
 * associate card grid — the new app previously only had a plain `<Select>` inside the modal with
 * no glanceable pending/set status or week-to-date summary). Each card opens `SetTargetsModal`
 * pre-selected to that teammate.
 */
function TargetRosterSection({
  teammates,
  onPick,
}: {
  teammates: NonNullable<DailyOverviewDTO["teammates"]>;
  onPick: (userId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white p-4 shadow-card">
      <div>
        <p className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
          Manager · Set today&apos;s targets
        </p>
        <p className="text-xs text-gray">Click any associate to set or edit their targets.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {teammates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            className="flex flex-col gap-1 rounded-lg border border-black/10 p-3 text-left transition hover:border-navy/30 hover:bg-navy/[0.02] focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-charcoal">{t.name}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  t.hasTargetToday ? "bg-green/10 text-green" : "bg-orange/10 text-orange",
                )}
              >
                {t.hasTargetToday ? "Set" : "Pending"}
              </span>
            </div>
            <p className="text-xs text-gray">
              {t.hasTargetToday ? "Target set for today" : "No target set yet"}
            </p>
            <p className="text-[11px] text-gray tabular-nums">
              WTD: {t.weekSourced}s · {t.weekOutreach}o · {t.daysLoggedThisWeek}d logged
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function SetTargetsModal({
  today,
  data,
  initialUserId,
  onClose,
  onSaved,
}: {
  today: string;
  data: DailyOverviewDTO;
  /** Pre-selected from a `TargetRosterSection` card click — locks the Associate field (legacy's
   *  per-person modal, no picker) instead of the generic dropdown-fallback flow. */
  initialUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const teammates = data.teammates ?? [];
  const clients = data.clients ?? [];
  // Legacy AI-suggest fallback defaults: 25 / 25 / 5 / 0 / 0.
  const [form, setForm] = useState<Record<string, string>>({
    userId: initialUserId ?? teammates[0]?.id ?? "",
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
  const [suggesting, setSuggesting] = useState(false);

  async function suggest() {
    if (!form.userId) return;
    setSuggesting(true);
    const res = await postJson<TargetsSuggestAiOutput>("/api/targets/suggest", {
      userId: form.userId,
      date: today,
    });
    setSuggesting(false);
    if (res.ok) {
      setForm((f) => ({
        ...f,
        sourcing: String(res.data.sourcing),
        outreach: String(res.data.outreach),
        atsCleanup: String(res.data.atsCleanup),
        inbound: String(res.data.inbound),
        screens: String(res.data.screens),
      }));
      toast.success(res.data.rationale);
    } else toast.error(messageForFailure(res.failure));
  }

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

  const lockedName = initialUserId
    ? (teammates.find((t) => t.id === initialUserId)?.name ?? null)
    : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={lockedName ? `Set targets · ${lockedName}` : `Set targets · ${today}`}
    >
      <div className="flex flex-col gap-4">
        {lockedName ? (
          <p className="text-xs text-gray">
            For <span className="font-semibold text-charcoal">{lockedName}</span> · {today}
          </p>
        ) : (
          <Field label="Associate" htmlFor="tg-user" required>
            <Select id="tg-user" value={form.userId} onChange={set("userId")}>
              {teammates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-wide text-gray uppercase">Targets</p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!form.userId}
            loading={suggesting}
            onClick={() => void suggest()}
          >
            ✨ AI Suggest
          </Button>
        </div>
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
