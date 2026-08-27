"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MEETING_TYPES } from "@/lib/constants";
import { addMeetingSchema, type ClientMeetingDTO } from "@/lib/validation/client";
import type { PostCrmClientMeetingResponse } from "@/app/api/crm/clients/[id]/meetings/route";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { deleteJson, postJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { fieldError } from "../../candidates/[id]/lib/form-error";

// --- Meetings tab (Wave 4.2 slice 2) ----------------------------------------

export function MeetingsTab({
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
            <li key={m.id} className="rounded-lg border border-black/5 bg-white shadow-card p-3">
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
      postJson<PostCrmClientMeetingResponse>(`/api/crm/clients/${clientId}/meetings`, values),
    onSuccess: (data) => {
      toast.success("Meeting logged");
      onSaved(data.meeting);
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
