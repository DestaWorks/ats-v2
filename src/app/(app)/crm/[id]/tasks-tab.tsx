"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addTaskSchema, type ClientTaskDTO } from "@/lib/validation/client";
import type { PostCrmClientTaskResponse } from "@/app/api/crm/clients/[id]/tasks/route";
import type { PatchCrmClientTaskResponse } from "@/app/api/crm/clients/[id]/tasks/[taskId]/route";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { deleteJson, messageForFailure, patchJson, postJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { fieldError } from "../../candidates/[id]/lib/form-error";

// --- Tasks tab (Wave 4.2 slice 2) -------------------------------------------

export function TasksTab({
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
    const res = await patchJson<PatchCrmClientTaskResponse>(
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
        <details className="rounded-lg border border-black/10 bg-white shadow-card p-3">
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
    <li className="flex items-center justify-between gap-3 rounded-lg border border-black/5 bg-white shadow-card p-3">
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
      postJson<PostCrmClientTaskResponse>(`/api/crm/clients/${clientId}/tasks`, values),
    onSuccess: (data) => {
      toast.success("Task added");
      onSaved(data.task);
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
