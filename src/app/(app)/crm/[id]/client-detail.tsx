"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CLIENT_CADENCES, CLIENT_PRIORITIES, CLOSED_DEAL_STAGES } from "@/lib/constants";
import {
  updateClientSchema,
  type ClientDetailDTO,
  type ClientProfileDTO,
  type UpdateClientInput,
} from "@/lib/validation/client";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { patchJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailTabs, type TabDef } from "@/components/ui/tabs";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldError } from "../../candidates/[id]/lib/form-error";
import { ContactsTab } from "./contacts-tab";
import { TasksTab } from "./tasks-tab";
import { MeetingsTab } from "./meetings-tab";
import { DealsTab } from "./deals-tab";
import { TimelineTab } from "./timeline-tab";
import { PortalAccessTab } from "./portal-tab";
import { HealthTab } from "./health-tab";
import { AiWorkspaceTab } from "./ai-workspace-tab";

/** `YYYY-MM-DD` for a native `<input type="date">`; `""` for the field's empty state. */
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function ClientDetail({
  initial,
  canConfigurePortal,
}: {
  initial: ClientDetailDTO;
  canConfigurePortal: boolean;
}) {
  const [detail, setDetail] = useState(initial);
  const [editing, setEditing] = useState(false);
  const { client, contacts, pipelineSnapshot, tasks, meetings, deals, timeline } = detail;

  const tabs: TabDef[] = [
    {
      key: "info",
      label: "Info",
      panel: <PipelineSnapshotCard snapshot={pipelineSnapshot} clientId={client.id} />,
    },
    {
      key: "contacts",
      label: `Contacts (${contacts.filter((c) => c.status === "active").length})`,
      panel: (
        <ContactsTab
          clientId={client.id}
          contacts={contacts}
          onChanged={(next) => setDetail((d) => ({ ...d, contacts: next }))}
        />
      ),
    },
    {
      key: "tasks",
      label: `Tasks (${tasks.filter((t) => t.status === "open").length})`,
      panel: (
        <TasksTab
          clientId={client.id}
          tasks={tasks}
          onChanged={(next) => setDetail((d) => ({ ...d, tasks: next }))}
        />
      ),
    },
    {
      key: "meetings",
      label: `Meetings (${meetings.length})`,
      panel: (
        <MeetingsTab
          clientId={client.id}
          meetings={meetings}
          onChanged={(next) => setDetail((d) => ({ ...d, meetings: next }))}
        />
      ),
    },
    {
      key: "deals",
      label: `Deals (${deals.filter((d) => !CLOSED_DEAL_STAGES.includes(d.stage as (typeof CLOSED_DEAL_STAGES)[number])).length})`,
      panel: (
        <DealsTab
          clientId={client.id}
          deals={deals}
          onChanged={(next) => setDetail((d) => ({ ...d, deals: next }))}
        />
      ),
    },
    {
      key: "timeline",
      label: "Timeline",
      panel: (
        <TimelineTab
          clientId={client.id}
          entries={timeline}
          onNoteAdded={(entry) =>
            setDetail((d) => ({ ...d, timeline: [entry, ...d.timeline].slice(0, 40) }))
          }
        />
      ),
    },
    { key: "health", label: "Health", panel: <HealthTab clientId={client.id} /> },
    { key: "ai-workspace", label: "AI Workspace", panel: <AiWorkspaceTab clientId={client.id} /> },
    ...(canConfigurePortal
      ? [{ key: "portal", label: "Portal", panel: <PortalAccessTab clientId={client.id} /> }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <Link href="/crm" className="text-sm font-semibold text-navy hover:underline">
        ← Back to CRM
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          {client.priority ? <Badge tone="navy">{client.priority}</Badge> : null}
          <h1 className="font-serif text-2xl font-bold text-charcoal">{client.name}</h1>
          <p className="text-sm text-gray">{client.location ?? "No location on file"}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing((e) => !e)}>
          {editing ? "Cancel edit" : "Edit"}
        </Button>
      </header>

      {editing ? (
        <EditClientForm
          client={client}
          onSaved={(c) => {
            setDetail((d) => ({ ...d, client: c }));
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="grid gap-3 rounded-lg border border-black/10 bg-white p-4 sm:grid-cols-3">
          <SummaryField label="Primary contact" value={client.contact} />
          <SummaryField label="Cadence" value={client.cadence} />
          <SummaryField label="Schedule" value={client.schedule} />
          <SummaryField
            label="Contract start"
            value={
              client.contractStart ? new Date(client.contractStart).toLocaleDateString() : null
            }
          />
          <SummaryField
            label="Renewal date"
            value={client.renewalDate ? new Date(client.renewalDate).toLocaleDateString() : null}
          />
          <SummaryField
            label="Capacity"
            value={client.capacity != null ? String(client.capacity) : null}
          />
          <SummaryField label="License states" value={client.states.join(", ") || null} />
          <SummaryField label="Specialties" value={client.specialties.join(", ") || null} />
          <SummaryField label="Services" value={client.services.join(", ") || "Recruiting"} />
        </div>
      )}

      <DetailTabs tabs={tabs} ariaLabel="Client detail" />
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-gray uppercase">{label}</p>
      <p className="text-sm text-charcoal">{value ?? "—"}</p>
    </div>
  );
}

function PipelineSnapshotCard({
  snapshot,
  clientId,
}: {
  snapshot: ClientDetailDTO["pipelineSnapshot"];
  clientId: string;
}) {
  const cells: [string, number][] = [
    ["Total", snapshot.total],
    ["Active", snapshot.active],
    ["Started", snapshot.started],
    ["Verified", snapshot.verified],
  ];
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-charcoal">Pipeline Snapshot</h2>
        <Link
          href={`/roles?clientId=${clientId}`}
          className="text-sm font-semibold text-navy hover:underline"
        >
          View Open Roles for this client →
        </Link>
      </div>
      <div className="flex gap-6">
        {cells.map(([label, n]) => (
          <div key={label} className="text-center">
            <div className="text-2xl font-bold text-navy">{n}</div>
            <div className="text-xs text-gray">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditClientForm({
  client,
  onSaved,
  onCancel,
}: {
  client: ClientProfileDTO;
  onSaved: (client: ClientProfileDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(updateClientSchema, {
    defaultValues: {
      name: client.name,
      capacity: client.capacity,
      contact: client.contact,
      location: client.location,
      priority: client.priority as UpdateClientInput["priority"],
      cadence: client.cadence as UpdateClientInput["cadence"],
      schedule: client.schedule,
      contractStart: client.contractStart ? new Date(client.contractStart) : null,
      renewalDate: client.renewalDate ? new Date(client.renewalDate) : null,
      states: client.states,
      specialties: client.specialties,
      services: client.services,
      monthlyRate: client.monthlyRate,
      avgPlacementFee: client.avgPlacementFee,
      grossMargin: client.grossMargin,
    },
    submit: (values) =>
      patchJson<{ client: ClientProfileDTO }>(`/api/crm/clients/${client.id}`, values),
    onSuccess: (data) => {
      toast.success("Client updated");
      onSaved(data.client);
    },
    onFailure: setServerError,
  });

  /** Comma-separated text ↔ string[] for the states/specialties/services fields. */
  const listField = (name: "states" | "specialties" | "services") => ({
    setValueAs: (v: unknown) =>
      typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
    ...form.register(name),
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-4"
    >
      {serverError ? <ErrorState message={serverError} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor="ec-name" error={fieldError(form, "name")} required>
          <Input id="ec-name" {...form.register("name")} />
        </Field>
        <Field label="Primary contact" htmlFor="ec-contact" error={fieldError(form, "contact")}>
          <Input id="ec-contact" {...form.register("contact", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Location" htmlFor="ec-location" error={fieldError(form, "location")}>
          <Input id="ec-location" {...form.register("location", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Priority" htmlFor="ec-priority" error={fieldError(form, "priority")}>
          <Select id="ec-priority" {...form.register("priority", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {CLIENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cadence" htmlFor="ec-cadence" error={fieldError(form, "cadence")}>
          <Select id="ec-cadence" {...form.register("cadence", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {CLIENT_CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Schedule" htmlFor="ec-schedule" error={fieldError(form, "schedule")}>
          <Input id="ec-schedule" {...form.register("schedule", { setValueAs: emptyToNull })} />
        </Field>
        <Field
          label="Contract start"
          htmlFor="ec-contract-start"
          error={fieldError(form, "contractStart")}
        >
          <Input
            id="ec-contract-start"
            type="date"
            defaultValue={toDateInputValue(client.contractStart)}
            {...form.register("contractStart", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Renewal date" htmlFor="ec-renewal" error={fieldError(form, "renewalDate")}>
          <Input
            id="ec-renewal"
            type="date"
            defaultValue={toDateInputValue(client.renewalDate)}
            {...form.register("renewalDate", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Capacity" htmlFor="ec-capacity" error={fieldError(form, "capacity")}>
          <Input
            id="ec-capacity"
            type="number"
            {...form.register("capacity", {
              setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
            })}
          />
        </Field>
        <Field
          label="Monthly rate ($)"
          htmlFor="ec-monthly-rate"
          error={fieldError(form, "monthlyRate")}
        >
          <Input
            id="ec-monthly-rate"
            type="number"
            {...form.register("monthlyRate", {
              setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
            })}
          />
        </Field>
        <Field
          label="Avg placement fee ($)"
          htmlFor="ec-placement-fee"
          error={fieldError(form, "avgPlacementFee")}
        >
          <Input
            id="ec-placement-fee"
            type="number"
            {...form.register("avgPlacementFee", {
              setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
            })}
          />
        </Field>
        <Field
          label="Gross margin (%)"
          htmlFor="ec-gross-margin"
          error={fieldError(form, "grossMargin")}
        >
          <Input
            id="ec-gross-margin"
            type="number"
            {...form.register("grossMargin", {
              setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
            })}
          />
        </Field>
        <Field
          label="License states (comma-separated)"
          htmlFor="ec-states"
          error={fieldError(form, "states")}
          className="sm:col-span-3"
        >
          <Input id="ec-states" defaultValue={client.states.join(", ")} {...listField("states")} />
        </Field>
        <Field
          label="Specialties (comma-separated)"
          htmlFor="ec-specialties"
          error={fieldError(form, "specialties")}
          className="sm:col-span-3"
        >
          <Input
            id="ec-specialties"
            defaultValue={client.specialties.join(", ")}
            {...listField("specialties")}
          />
        </Field>
        <Field
          label="Services (comma-separated)"
          htmlFor="ec-services"
          error={fieldError(form, "services")}
          className="sm:col-span-3"
        >
          <Input
            id="ec-services"
            defaultValue={client.services.join(", ")}
            {...listField("services")}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-3">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
