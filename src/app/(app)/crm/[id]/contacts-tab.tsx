"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CONTACT_ROLES, CONTACT_ROLE_LABELS, CONTACT_STATUSES } from "@/lib/constants";
import {
  addContactSchema,
  updateContactSchema,
  type AddContactInput,
  type ClientContactDTO,
  type UpdateContactInput,
} from "@/lib/validation/client";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { deleteJson, messageForFailure, patchJson, postJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { fieldError } from "../../candidates/[id]/lib/form-error";

// --- Contacts tab (Wave 4.2 slice 1) -----------------------------------------

type ContactModalState = { mode: "add" } | { mode: "edit"; contact: ClientContactDTO } | null;

export function ContactsTab({
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
  const [markingLeftId, setMarkingLeftId] = useState<string | null>(null);
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
    setMarkingLeftId(contact.id);
    const res = await patchJson<{ contact: ClientContactDTO }>(
      `/api/crm/clients/${clientId}/contacts/${contact.id}`,
      { status: "left" },
    );
    setMarkingLeftId(null);
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
              markingLeft={markingLeftId === c.id}
              onEdit={() => setModal({ mode: "edit", contact: c })}
              onMarkLeft={() => void handleMarkLeft(c)}
              onDelete={() => void handleDelete(c)}
            />
          ))}
        </ul>
      )}

      {departed.length > 0 ? (
        <details className="rounded-lg border border-black/10 bg-white shadow-card p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray">
            {departed.length} departed contact{departed.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {departed.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                deleting={deletingId === c.id}
                markingLeft={markingLeftId === c.id}
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
  markingLeft,
  onEdit,
  onMarkLeft,
  onDelete,
}: {
  contact: ClientContactDTO;
  deleting: boolean;
  markingLeft: boolean;
  onEdit: () => void;
  onMarkLeft: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 bg-white shadow-card p-3">
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
        <Button type="button" variant="secondary" size="xs" disabled={deleting} onClick={onEdit}>
          Edit
        </Button>
        {contact.status === "active" ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            loading={markingLeft}
            onClick={onMarkLeft}
          >
            Mark departed
          </Button>
        ) : null}
        <Button
          type="button"
          variant="danger"
          size="xs"
          loading={deleting}
          disabled={markingLeft}
          onClick={onDelete}
        >
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
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
