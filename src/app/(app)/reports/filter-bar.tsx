"use client";

import type { ReportFilterOptionsDTO } from "@/server/services/reports/filter-options.service";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ReportFilterState } from "./lib/use-report-fetch";

/** The universal filter bar every report tab reads from (legacy's `rClient`/`rAssoc`/`rRole`/
 *  `rSource`/`rFrom`/`rTo` bar, `index.html:8108-8115`) — one shared control, not re-declared per tab. */
export function ReportFilterBar({
  filters,
  onChange,
  options,
}: {
  filters: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  options: ReportFilterOptionsDTO;
}) {
  const set =
    <K extends keyof ReportFilterState>(key: K) =>
    (value: string) =>
      onChange({ ...filters, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-black/5 bg-white shadow-card p-4 sm:grid-cols-3 lg:grid-cols-6 print:hidden">
      <Field label="Client" htmlFor="rf-client">
        <Select
          id="rf-client"
          value={filters.clientId}
          onChange={(e) => set("clientId")(e.target.value)}
        >
          <option value="">All clients</option>
          {options.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Associate" htmlFor="rf-assoc">
        <Select
          id="rf-assoc"
          value={filters.createdById}
          onChange={(e) => set("createdById")(e.target.value)}
        >
          <option value="">All associates</option>
          {options.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Source" htmlFor="rf-source">
        <Select
          id="rf-source"
          value={filters.source}
          onChange={(e) => set("source")(e.target.value)}
        >
          <option value="">All sources</option>
          {options.sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Credential" htmlFor="rf-cred">
        <Select
          id="rf-cred"
          value={filters.credential}
          onChange={(e) => set("credential")(e.target.value)}
        >
          <option value="">All credentials</option>
          {options.credentials.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Added from" htmlFor="rf-from">
        <Input
          id="rf-from"
          type="date"
          value={filters.addedFrom}
          onChange={(e) => set("addedFrom")(e.target.value)}
        />
      </Field>
      <Field label="Added to" htmlFor="rf-to">
        <Input
          id="rf-to"
          type="date"
          value={filters.addedTo}
          onChange={(e) => set("addedTo")(e.target.value)}
        />
      </Field>
    </div>
  );
}
