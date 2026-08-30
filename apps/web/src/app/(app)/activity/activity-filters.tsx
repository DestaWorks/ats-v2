"use client";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  auditActionLabel,
  auditEntityLabel,
} from "@destaworks/domain/constants";
import type { ActivityActorOption } from "@destaworks/contracts/validation/activity";
import { Button } from "@destaworks/ui/button";
import { Field } from "@destaworks/ui/field";
import { useUrlFilters } from "../lib/use-url-filters";

/**
 * The Activity Log filter bar (AL-5) — action / entity / actor selects + a from/to date range, all
 * reflected in the URL `searchParams` (shareable) through the shared `useUrlFilters`. Each change
 * `router.replace`s the URL; the RSC re-reads page 1 for the new filters. Every control is labeled
 * via `Field` — a labeled grid rather than the compact `FilterToolbar` the browse lists use, because
 * this bar has no free-text search and its date range does not fit the toolbar's popover of selects.
 * A "Clear" resets to the bare `/activity`. Client component — imports no `src/server/**`; the actor
 * options are handed in by the RSC (resolved from the distinct actors that appear in the log).
 */

const CONTROL_CLASS = "rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm";

export function ActivityFilters({ actors }: { actors: ActivityActorOption[] }) {
  const f = useUrlFilters();

  const action = f.get("action");
  const entity = f.get("entity");
  const actor = f.get("actor");
  const from = f.get("from");
  const to = f.get("to");

  const hasFilters = Boolean(action || entity || actor || from || to);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Action" htmlFor="activity-action">
        <select
          id="activity-action"
          value={action}
          onChange={(e) => f.setParam("action", e.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {auditActionLabel(a)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Entity" htmlFor="activity-entity">
        <select
          id="activity-entity"
          value={entity}
          onChange={(e) => f.setParam("entity", e.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="">All entities</option>
          {AUDIT_ENTITIES.map((en) => (
            <option key={en} value={en}>
              {auditEntityLabel(en)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Actor" htmlFor="activity-actor">
        <select
          id="activity-actor"
          value={actor}
          onChange={(e) => f.setParam("actor", e.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="">All actors</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="From" htmlFor="activity-from">
        <input
          id="activity-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => f.setParam("from", e.target.value)}
          className={CONTROL_CLASS}
        />
      </Field>

      <Field label="To" htmlFor="activity-to">
        <input
          id="activity-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => f.setParam("to", e.target.value)}
          className={CONTROL_CLASS}
        />
      </Field>

      {hasFilters ? (
        <Button type="button" variant="secondary" size="sm" onClick={f.clearAll}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
