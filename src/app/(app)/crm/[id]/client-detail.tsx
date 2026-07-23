"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CLIENT_CADENCES,
  CLIENT_PRIORITIES,
  CLOSED_DEAL_STAGES,
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  CONTACT_STATUSES,
  DEAL_STAGES,
  MEETING_TYPES,
  OPEN_DEAL_STAGES,
} from "@/lib/constants";
import {
  addContactSchema,
  addMeetingSchema,
  addTaskSchema,
  createDealSchema,
  updateClientSchema,
  updateContactSchema,
  updateDealSchema,
  type AddBlockerInput,
  type AddContactInput,
  type ClientContactDTO,
  type ClientDetailDTO,
  type ClientMeetingDTO,
  type ClientProfileDTO,
  type ClientTaskDTO,
  type ClientTimelineEntryDTO,
  type DealBlockerDTO,
  type DealDTO,
  type UpdateClientInput,
  type UpdateContactInput,
  type UpdateDealInput,
} from "@/lib/validation/client";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { deleteJson, messageForFailure, patchJson, postJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailTabs, type TabDef } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { fieldError } from "../../candidates/[id]/lib/form-error";

/** `YYYY-MM-DD` for a native `<input type="date">`; `""` for the field's empty state. */
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function ClientDetail({ initial }: { initial: ClientDetailDTO }) {
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
      panel: <TimelineTab entries={timeline} />,
    },
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

// --- Contacts tab -----------------------------------------------------------

type ContactModalState = { mode: "add" } | { mode: "edit"; contact: ClientContactDTO } | null;

function ContactsTab({
  clientId,
  contacts,
  onChanged,
}: {
  clientId: string;
  contacts: ClientContactDTO[];
  onChanged: (next: ClientContactDTO[]) => void;
}) {
  const [modal, setModal] = useState<ContactModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const active = contacts.filter((c) => c.status === "active");
  const departed = contacts.filter((c) => c.status !== "active");

  function upsertContact(contact: ClientContactDTO) {
    const exists = contacts.some((c) => c.id === contact.id);
    onChanged(
      exists ? contacts.map((c) => (c.id === contact.id ? contact : c)) : [...contacts, contact],
    );
  }

  async function handleDelete(contact: ClientContactDTO) {
    if (!window.confirm(`Remove ${contact.fullName}? This cannot be undone.`)) return;
    setDeletingId(contact.id);
    const res = await deleteJson(`/api/crm/clients/${clientId}/contacts/${contact.id}`);
    setDeletingId(null);
    if (res.ok) {
      toast.success("Contact removed");
      onChanged(contacts.filter((c) => c.id !== contact.id));
    } else {
      toast.error("Could not remove this contact");
    }
  }

  async function handleMarkLeft(contact: ClientContactDTO) {
    const res = await patchJson<{ contact: ClientContactDTO }>(
      `/api/crm/clients/${clientId}/contacts/${contact.id}`,
      { status: "left" },
    );
    if (res.ok) {
      toast.success(`${contact.fullName} marked as departed`);
      upsertContact(res.data.contact);
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray">
          {active.length} active contact{active.length === 1 ? "" : "s"}
          {departed.length > 0 ? ` · ${departed.length} departed` : ""}
        </p>
        <Button type="button" variant="success" size="sm" onClick={() => setModal({ mode: "add" })}>
          + Add Contact
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          title="No contacts tracked"
          description="Add the practice manager, a decision maker — anyone who matters at this account."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              deleting={deletingId === c.id}
              onEdit={() => setModal({ mode: "edit", contact: c })}
              onMarkLeft={() => void handleMarkLeft(c)}
              onDelete={() => void handleDelete(c)}
            />
          ))}
        </ul>
      )}

      {departed.length > 0 ? (
        <details className="rounded-lg border border-black/10 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray">
            {departed.length} departed contact{departed.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {departed.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                deleting={deletingId === c.id}
                onEdit={() => setModal({ mode: "edit", contact: c })}
                onMarkLeft={() => void handleMarkLeft(c)}
                onDelete={() => void handleDelete(c)}
              />
            ))}
          </ul>
        </details>
      ) : null}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? "Edit contact" : "Add contact"}
      >
        {modal ? (
          <ContactForm
            clientId={clientId}
            existing={modal.mode === "edit" ? modal.contact : null}
            onSaved={(c) => {
              upsertContact(c);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function ContactRow({
  contact,
  deleting,
  onEdit,
  onMarkLeft,
  onDelete,
}: {
  contact: ClientContactDTO;
  deleting: boolean;
  onEdit: () => void;
  onMarkLeft: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 bg-white p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-charcoal">{contact.fullName}</span>
          <Badge tone="neutral" size="sm">
            {CONTACT_ROLE_LABELS[contact.role as keyof typeof CONTACT_ROLE_LABELS] ?? contact.role}
          </Badge>
          {contact.status === "left" ? (
            <Badge tone="danger" size="sm">
              Departed
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-gray">
          {[contact.title, contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button type="button" variant="secondary" size="xs" onClick={onEdit}>
          Edit
        </Button>
        {contact.status === "active" ? (
          <Button type="button" variant="secondary" size="xs" onClick={onMarkLeft}>
            Mark departed
          </Button>
        ) : null}
        <Button type="button" variant="danger" size="xs" loading={deleting} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
  );
}

function ContactForm({
  clientId,
  existing,
  onSaved,
  onCancel,
}: {
  clientId: string;
  existing: ClientContactDTO | null;
  onSaved: (contact: ClientContactDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = existing ? updateContactSchema : addContactSchema;
  const { form, pending, onSubmit } = useApiForm(schema, {
    defaultValues: existing
      ? {
          fullName: existing.fullName,
          title: existing.title,
          role: existing.role as AddContactInput["role"],
          email: existing.email,
          phone: existing.phone,
          linkedin: existing.linkedin,
          reportsTo: existing.reportsTo,
          status: existing.status as UpdateContactInput["status"],
          notes: existing.notes,
        }
      : { fullName: "", role: "unknown" },
    submit: (values) => {
      const url = existing
        ? `/api/crm/clients/${clientId}/contacts/${existing.id}`
        : `/api/crm/clients/${clientId}/contacts`;
      return existing
        ? patchJson<{ contact: ClientContactDTO }>(url, values)
        : postJson<{ contact: ClientContactDTO }>(url, values);
    },
    onSuccess: (data) => {
      toast.success(existing ? "Contact updated" : "Contact added");
      onSaved(data.contact);
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name"
          htmlFor="cc-name"
          error={fieldError(form, "fullName")}
          required
          className="sm:col-span-2"
        >
          <Input id="cc-name" autoFocus {...form.register("fullName")} />
        </Field>
        <Field label="Title" htmlFor="cc-title" error={fieldError(form, "title")}>
          <Input id="cc-title" {...form.register("title", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Role" htmlFor="cc-role" error={fieldError(form, "role")}>
          <Select id="cc-role" {...form.register("role")}>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {CONTACT_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email" htmlFor="cc-email" error={fieldError(form, "email")}>
          <Input
            id="cc-email"
            type="email"
            {...form.register("email", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Phone" htmlFor="cc-phone" error={fieldError(form, "phone")}>
          <Input id="cc-phone" {...form.register("phone", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="LinkedIn" htmlFor="cc-linkedin" error={fieldError(form, "linkedin")}>
          <Input id="cc-linkedin" {...form.register("linkedin", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Reports to" htmlFor="cc-reports-to" error={fieldError(form, "reportsTo")}>
          <Input id="cc-reports-to" {...form.register("reportsTo", { setValueAs: emptyToNull })} />
        </Field>
        {existing ? (
          <Field label="Status" htmlFor="cc-status" error={fieldError(form, "status")}>
            <Select id="cc-status" {...form.register("status")}>
              {CONTACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "active" ? "Active" : "Departed"}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          label="Notes"
          htmlFor="cc-notes"
          error={fieldError(form, "notes")}
          className="sm:col-span-2"
        >
          <Input id="cc-notes" {...form.register("notes", { setValueAs: emptyToNull })} />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          {existing ? "Save" : "Add Contact"}
        </Button>
      </div>
    </form>
  );
}

// --- Tasks tab (Wave 4.2 slice 2) -------------------------------------------

function TasksTab({
  clientId,
  tasks,
  onChanged,
}: {
  clientId: string;
  tasks: ClientTaskDTO[];
  onChanged: (next: ClientTaskDTO[]) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open");

  function upsertTask(task: ClientTaskDTO) {
    const exists = tasks.some((t) => t.id === task.id);
    onChanged(exists ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task]);
  }

  async function handleToggle(task: ClientTaskDTO) {
    setPendingId(task.id);
    const res = await patchJson<{ task: ClientTaskDTO }>(
      `/api/crm/clients/${clientId}/tasks/${task.id}`,
      { status: task.status === "open" ? "done" : "open" },
    );
    setPendingId(null);
    if (res.ok) upsertTask(res.data.task);
    else toast.error(messageForFailure(res.failure));
  }

  async function handleDelete(task: ClientTaskDTO) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setPendingId(task.id);
    const res = await deleteJson(`/api/crm/clients/${clientId}/tasks/${task.id}`);
    setPendingId(null);
    if (res.ok) {
      toast.success("Task deleted");
      onChanged(tasks.filter((t) => t.id !== task.id));
    } else {
      toast.error("Could not delete this task");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray">
          {open.length} open task{open.length === 1 ? "" : "s"}
          {done.length > 0 ? ` · ${done.length} completed` : ""}
        </p>
        <Button type="button" variant="success" size="sm" onClick={() => setModalOpen(true)}>
          + Add Task
        </Button>
      </div>

      {open.length === 0 ? (
        <EmptyState title="No open tasks" description="Add a follow-up task above." />
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              pending={pendingId === t.id}
              onToggle={() => void handleToggle(t)}
              onDelete={() => void handleDelete(t)}
            />
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <details className="rounded-lg border border-black/10 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray">
            {done.length} completed task{done.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {done.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                pending={pendingId === t.id}
                onToggle={() => void handleToggle(t)}
                onDelete={() => void handleDelete(t)}
              />
            ))}
          </ul>
        </details>
      ) : null}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add task">
        {modalOpen ? (
          <TaskForm
            clientId={clientId}
            onSaved={(t) => {
              upsertTask(t);
              setModalOpen(false);
            }}
            onCancel={() => setModalOpen(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function TaskRow({
  task,
  pending,
  onToggle,
  onDelete,
}: {
  task: ClientTaskDTO;
  pending: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-label={done ? "Mark as open" : "Mark as done"}
          className={`flex h-5 w-5 items-center justify-center rounded border-2 text-xs font-bold ${
            done ? "border-green bg-green text-white" : "border-black/20 text-transparent"
          }`}
        >
          ✓
        </button>
        <div>
          <p className={`text-sm font-medium ${done ? "text-gray line-through" : "text-charcoal"}`}>
            {task.title}
          </p>
          <p className="text-xs text-gray">
            {[
              task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : null,
              task.assignedToId,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      </div>
      <Button type="button" variant="danger" size="xs" loading={pending} onClick={onDelete}>
        Delete
      </Button>
    </li>
  );
}

function TaskForm({
  clientId,
  onSaved,
  onCancel,
}: {
  clientId: string;
  onSaved: (task: ClientTaskDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(addTaskSchema, {
    defaultValues: { title: "" },
    submit: (values) =>
      postJson<{ task: ClientTaskDTO }>(`/api/crm/clients/${clientId}/tasks`, values),
    onSuccess: (data) => {
      toast.success("Task added");
      onSaved(data.task);
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <Field label="Title" htmlFor="ct-title" error={fieldError(form, "title")} required>
        <Input id="ct-title" autoFocus {...form.register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due date" htmlFor="ct-due" error={fieldError(form, "dueDate")}>
          <Input
            id="ct-due"
            type="date"
            {...form.register("dueDate", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Assignee" htmlFor="ct-assignee" error={fieldError(form, "assignedToId")}>
          <Input
            id="ct-assignee"
            placeholder="Name"
            {...form.register("assignedToId", { setValueAs: emptyToNull })}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Task
        </Button>
      </div>
    </form>
  );
}

// --- Meetings tab (Wave 4.2 slice 2) ----------------------------------------

function MeetingsTab({
  clientId,
  meetings,
  onChanged,
}: {
  clientId: string;
  meetings: ClientMeetingDTO[];
  onChanged: (next: ClientMeetingDTO[]) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(meeting: ClientMeetingDTO) {
    if (!window.confirm("Delete this meeting log entry? This cannot be undone.")) return;
    setDeletingId(meeting.id);
    const res = await deleteJson(`/api/crm/clients/${clientId}/meetings/${meeting.id}`);
    setDeletingId(null);
    if (res.ok) {
      toast.success("Meeting deleted");
      onChanged(meetings.filter((m) => m.id !== meeting.id));
    } else {
      toast.error("Could not delete this meeting");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray">
          {meetings.length} meeting{meetings.length === 1 ? "" : "s"} logged
        </p>
        <Button type="button" variant="success" size="sm" onClick={() => setModalOpen(true)}>
          + Log Meeting
        </Button>
      </div>

      {meetings.length === 0 ? (
        <EmptyState
          title="No meetings logged"
          description="Log a weekly/monthly/QBR check-in above."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {meetings.map((m) => (
            <li key={m.id} className="rounded-lg border border-black/5 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="navy" size="sm" className="capitalize">
                      {m.type}
                    </Badge>
                    <time className="text-xs text-gray">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  {m.attendees ? (
                    <p className="mt-1 text-xs text-gray">With: {m.attendees}</p>
                  ) : null}
                  {m.notes ? <p className="mt-1 text-sm text-charcoal">{m.notes}</p> : null}
                  {m.actionItems ? (
                    <p className="mt-1 text-xs text-gray italic">Actions: {m.actionItems}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="xs"
                  loading={deletingId === m.id}
                  onClick={() => void handleDelete(m)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Log meeting">
        {modalOpen ? (
          <MeetingForm
            clientId={clientId}
            onSaved={(m) => {
              onChanged([m, ...meetings]);
              setModalOpen(false);
            }}
            onCancel={() => setModalOpen(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function MeetingForm({
  clientId,
  onSaved,
  onCancel,
}: {
  clientId: string;
  onSaved: (meeting: ClientMeetingDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(addMeetingSchema, {
    defaultValues: { type: "adhoc" },
    submit: (values) =>
      postJson<{ meeting: ClientMeetingDTO }>(`/api/crm/clients/${clientId}/meetings`, values),
    onSuccess: (data) => {
      toast.success("Meeting logged");
      onSaved(data.meeting);
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <Field label="Type" htmlFor="cm-type" error={fieldError(form, "type")} required>
        <Select id="cm-type" {...form.register("type")}>
          {MEETING_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Attendees" htmlFor="cm-attendees" error={fieldError(form, "attendees")}>
        <Input id="cm-attendees" {...form.register("attendees", { setValueAs: emptyToNull })} />
      </Field>
      <Field label="Notes" htmlFor="cm-notes" error={fieldError(form, "notes")}>
        <textarea
          id="cm-notes"
          rows={3}
          className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
          {...form.register("notes", { setValueAs: emptyToNull })}
        />
      </Field>
      <Field label="Action items" htmlFor="cm-actions" error={fieldError(form, "actionItems")}>
        <textarea
          id="cm-actions"
          rows={2}
          className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
          {...form.register("actionItems", { setValueAs: emptyToNull })}
        />
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Log Meeting
        </Button>
      </div>
    </form>
  );
}

// --- Timeline tab (Wave 4.2 slice 2) — read-only ----------------------------

const TIMELINE_ICON: Record<ClientTimelineEntryDTO["kind"], string> = {
  client_created: "🏢",
  contact_added: "👤",
  task_created: "📋",
  task_completed: "✅",
  meeting_logged: "🗓️",
  deal_created: "💼",
  deal_closed: "🏁",
};

function TimelineTab({ entries }: { entries: ClientTimelineEntryDTO[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState title="No activity yet" description="Activity will appear here over time." />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-lg border border-black/5 bg-white p-3"
        >
          <span className="text-lg" aria-hidden>
            {TIMELINE_ICON[e.kind]}
          </span>
          <div className="flex-1">
            <p className="text-sm text-charcoal">{e.summary}</p>
          </div>
          <time className="text-xs whitespace-nowrap text-gray">
            {new Date(e.at).toLocaleString()}
          </time>
        </li>
      ))}
    </ul>
  );
}

// --- Deals tab (Wave 4.2 slice 3) — kanban ----------------------------------

function formatMoney(n: number | null): string {
  return n == null ? "—" : `$${n.toLocaleString()}`;
}

function DealsTab({
  clientId,
  deals,
  onChanged,
}: {
  clientId: string;
  deals: DealDTO[];
  onChanged: (next: DealDTO[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<DealDTO | null>(null);
  const closed = deals.filter((d) =>
    CLOSED_DEAL_STAGES.includes(d.stage as (typeof CLOSED_DEAL_STAGES)[number]),
  );

  function upsertDeal(deal: DealDTO) {
    const exists = deals.some((d) => d.id === deal.id);
    onChanged(exists ? deals.map((d) => (d.id === deal.id ? deal : d)) : [...deals, deal]);
  }

  function removeDealLocal(dealId: string) {
    onChanged(deals.filter((d) => d.id !== dealId));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray">
          {deals.length - closed.length} open deal{deals.length - closed.length === 1 ? "" : "s"}
          {closed.length > 0 ? ` · ${closed.length} closed` : ""}
        </p>
        <Button type="button" variant="success" size="sm" onClick={() => setAddOpen(true)}>
          + Add Deal
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {OPEN_DEAL_STAGES.map((stage) => (
          <div key={stage} className="flex flex-col gap-2 rounded-lg bg-black/[0.02] p-2">
            <div className="px-1 text-xs font-bold tracking-wide text-gray uppercase">
              {stage} ({deals.filter((d) => d.stage === stage).length})
            </div>
            {deals
              .filter((d) => d.stage === stage)
              .map((d) => (
                <DealCard key={d.id} deal={d} onClick={() => setSelected(d)} />
              ))}
          </div>
        ))}
      </div>

      {closed.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">Closed Deals</h3>
          <ul className="flex flex-col gap-2">
            {closed.map((d) => (
              <li
                key={d.id}
                onClick={() => setSelected(d)}
                className="cursor-pointer rounded-lg border border-black/5 bg-white p-3 hover:bg-black/[0.02]"
              >
                <div className="flex items-center gap-2">
                  <Badge tone={d.stage === "Signed" ? "success" : "danger"} size="sm">
                    {d.stage === "Signed" ? "Won" : "Lost"}
                  </Badge>
                  <span className="text-sm font-semibold text-charcoal">{d.name}</span>
                  <span className="text-xs text-gray">{formatMoney(d.estValue)}</span>
                </div>
                {d.closeReason ? (
                  <p className="mt-1 text-xs text-gray">Reason: {d.closeReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add deal">
        {addOpen ? (
          <AddDealForm
            clientId={clientId}
            onSaved={(d) => {
              upsertDeal(d);
              setAddOpen(false);
            }}
            onCancel={() => setAddOpen(false)}
          />
        ) : null}
      </Modal>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Deal"}
      >
        {selected ? (
          <DealDetailModal
            clientId={clientId}
            deal={selected}
            onChanged={(d) => {
              upsertDeal(d);
              setSelected(d);
            }}
            onDeleted={() => {
              removeDealLocal(selected.id);
              setSelected(null);
            }}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function DealCard({ deal, onClick }: { deal: DealDTO; onClick: () => void }) {
  const openBlockers = deal.blockers.filter((b) => !b.resolved).length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white p-2.5 text-left shadow-sm hover:border-navy/30"
    >
      <span className="text-sm font-semibold text-charcoal">{deal.name}</span>
      <span className="text-xs text-gray">{formatMoney(deal.estValue)}</span>
      <div className="flex items-center gap-1.5">
        {deal.probabilityOverride != null ? (
          <Badge tone="navy" size="sm">
            {deal.probabilityOverride}%
          </Badge>
        ) : null}
        {openBlockers > 0 ? (
          <Badge tone="danger" size="sm">
            {openBlockers} blocker{openBlockers === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

function AddDealForm({
  clientId,
  onSaved,
  onCancel,
}: {
  clientId: string;
  onSaved: (deal: DealDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(createDealSchema, {
    defaultValues: { name: "" },
    submit: (values) => postJson<{ deal: DealDTO }>(`/api/crm/clients/${clientId}/deals`, values),
    onSuccess: (data) => {
      toast.success("Deal added");
      onSaved(data.deal);
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <Field label="Name" htmlFor="cd-name" error={fieldError(form, "name")} required>
        <Input id="cd-name" autoFocus {...form.register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Est. value ($)" htmlFor="cd-value" error={fieldError(form, "estValue")}>
          <Input
            id="cd-value"
            type="number"
            {...form.register("estValue", {
              setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
            })}
          />
        </Field>
        <Field
          label="Expected close"
          htmlFor="cd-close-date"
          error={fieldError(form, "expectedCloseDate")}
        >
          <Input
            id="cd-close-date"
            type="date"
            {...form.register("expectedCloseDate", { setValueAs: emptyToNull })}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Deal
        </Button>
      </div>
    </form>
  );
}

function DealDetailModal({
  clientId,
  deal,
  onChanged,
  onDeleted,
  onClose,
}: {
  clientId: string;
  deal: DealDTO;
  onChanged: (deal: DealDTO) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState(deal.closeReason ?? "");
  const [postMortem, setPostMortem] = useState(deal.postMortem ?? "");
  const [blockerText, setBlockerText] = useState("");
  const isClosed = CLOSED_DEAL_STAGES.includes(deal.stage as (typeof CLOSED_DEAL_STAGES)[number]);

  const form = useZodForm(updateDealSchema, {
    defaultValues: {
      name: deal.name,
      estValue: deal.estValue,
      probabilityOverride: deal.probabilityOverride,
    },
  });

  async function patchDeal(values: UpdateDealInput) {
    const res = await patchJson<{ deal: DealDTO }>(
      `/api/crm/clients/${clientId}/deals/${deal.id}`,
      values,
    );
    if (res.ok) onChanged(res.data.deal);
    else toast.error(messageForFailure(res.failure));
    return res;
  }

  function onSubmit(values: UpdateDealInput) {
    startTransition(async () => {
      const res = await patchDeal(values);
      if (res.ok) toast.success("Deal updated");
    });
  }

  function moveStage(stage: string) {
    if ((CLOSED_DEAL_STAGES as readonly string[]).includes(stage)) {
      setClosing(true);
      return;
    }
    startTransition(async () => {
      await patchDeal({ stage: stage as UpdateDealInput["stage"] });
    });
  }

  function confirmClose(stage: "Signed" | "Lost") {
    startTransition(async () => {
      const res = await patchDeal({
        stage,
        closeReason: closeReason || null,
        postMortem: postMortem || null,
      });
      if (res.ok) {
        toast.success(stage === "Signed" ? "Deal marked won" : "Deal marked lost");
        setClosing(false);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${deal.name}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const res = await deleteJson(`/api/crm/clients/${clientId}/deals/${deal.id}`);
      if (res.ok) {
        toast.success("Deal deleted");
        onDeleted();
      } else {
        toast.error("Could not delete this deal");
      }
    });
  }

  async function handleAddBlocker() {
    if (!blockerText.trim()) return;
    const res = await postJson<{ blocker: DealBlockerDTO }>(
      `/api/crm/clients/${clientId}/deals/${deal.id}/blockers`,
      { text: blockerText.trim() } satisfies AddBlockerInput,
    );
    if (res.ok) {
      onChanged({ ...deal, blockers: [...deal.blockers, res.data.blocker] });
      setBlockerText("");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleToggleBlocker(blocker: DealBlockerDTO) {
    const res = await patchJson<{ blocker: DealBlockerDTO }>(
      `/api/crm/clients/${clientId}/deals/${deal.id}/blockers/${blocker.id}`,
      { resolved: !blocker.resolved },
    );
    if (res.ok) {
      onChanged({
        ...deal,
        blockers: deal.blockers.map((b) => (b.id === blocker.id ? res.data.blocker : b)),
      });
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleDeleteBlocker(blocker: DealBlockerDTO) {
    const res = await deleteJson(
      `/api/crm/clients/${clientId}/deals/${deal.id}/blockers/${blocker.id}`,
    );
    if (res.ok) {
      onChanged({ ...deal, blockers: deal.blockers.filter((b) => b.id !== blocker.id) });
    } else {
      toast.error("Could not delete this blocker");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Field label="Name" htmlFor="dd-name" error={fieldError(form, "name")} required>
          <Input id="dd-name" {...form.register("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Est. value ($)" htmlFor="dd-value" error={fieldError(form, "estValue")}>
            <Input
              id="dd-value"
              type="number"
              {...form.register("estValue", {
                setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
              })}
            />
          </Field>
          <Field
            label="Probability override (%)"
            htmlFor="dd-prob"
            error={fieldError(form, "probabilityOverride")}
          >
            <Input
              id="dd-prob"
              type="number"
              min={0}
              max={100}
              {...form.register("probabilityOverride", {
                setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
              })}
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </div>
      </form>

      <div>
        <div className="mb-1 text-[11px] text-gray uppercase">Stage</div>
        <Select value={deal.stage} onChange={(e) => moveStage(e.target.value)} disabled={pending}>
          {DEAL_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {closing ? (
        <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-black/[0.02] p-3">
          <p className="text-sm font-semibold text-charcoal">Close this deal</p>
          <Field label="Reason" htmlFor="dd-close-reason">
            <Input
              id="dd-close-reason"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
            />
          </Field>
          <Field label="Post-mortem" htmlFor="dd-postmortem">
            <textarea
              id="dd-postmortem"
              rows={3}
              className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
              value={postMortem}
              onChange={(e) => setPostMortem(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setClosing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              size="sm"
              loading={pending}
              onClick={() => confirmClose("Signed")}
            >
              Mark Won
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={pending}
              onClick={() => confirmClose("Lost")}
            >
              Mark Lost
            </Button>
          </div>
        </div>
      ) : null}

      {isClosed && (deal.closeReason || deal.postMortem) ? (
        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 text-sm">
          {deal.closeReason ? (
            <p>
              <span className="font-semibold">Reason:</span> {deal.closeReason}
            </p>
          ) : null}
          {deal.postMortem ? (
            <p className="mt-1">
              <span className="font-semibold">Post-mortem:</span> {deal.postMortem}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-[11px] text-gray uppercase">Blockers</div>
        <div className="flex flex-col gap-2">
          {deal.blockers.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                onClick={() => void handleToggleBlocker(b)}
                className={`flex-1 text-left ${b.resolved ? "text-gray line-through" : "text-charcoal"}`}
              >
                {b.resolved ? "✅" : "⬜"} {b.text}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteBlocker(b)}
                className="text-xs text-red hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {deal.blockers.length === 0 ? <p className="text-xs text-gray">No blockers.</p> : null}
          <div className="flex gap-2">
            <Input
              value={blockerText}
              onChange={(e) => setBlockerText(e.target.value)}
              placeholder="Add a blocker…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddBlocker();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleAddBlocker()}
            >
              Add
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/5 pt-4">
        <Button type="button" variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
          Delete Deal
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
