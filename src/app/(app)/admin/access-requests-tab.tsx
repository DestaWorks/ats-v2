"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ROLES } from "@/lib/constants";
import {
  approveRequestSchema,
  type AccessRequestDTO,
  type GeneratedPasswordDTO,
} from "@/lib/validation/admin";
import { useApiForm } from "@/lib/forms/use-api-form";
import { messageForFailure, postJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { fieldError } from "../candidates/[id]/lib/form-error";

export function AccessRequestsTab({
  pending,
  resolved,
  onResolved,
  onPassword,
}: {
  pending: AccessRequestDTO[];
  resolved: AccessRequestDTO[];
  onResolved: (request: AccessRequestDTO) => void;
  onPassword: (email: string, result: { generatedPassword: string | null }) => void;
}) {
  const [approving, setApproving] = useState<AccessRequestDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDecline(request: AccessRequestDTO) {
    if (!window.confirm(`Decline the request from ${request.name}?`)) return;
    setBusyId(request.id);
    const res = await postJson<{ ok: true }>(
      `/api/admin/access-requests/${request.id}/decline`,
      {},
    );
    setBusyId(null);
    if (res.ok) {
      toast.success("Request declined");
      onResolved({ ...request, status: "declined" });
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.length === 0 ? (
        <EmptyState title="No pending requests" description="New access requests appear here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 bg-white shadow-card p-3"
            >
              <div>
                <p className="text-sm font-semibold text-charcoal">
                  {r.name} <span className="font-normal text-gray">— {r.email}</span>
                </p>
                <p className="text-xs text-gray">
                  {[r.organization, r.message].filter(Boolean).join(" · ") ||
                    "No additional details"}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button type="button" variant="success" size="xs" onClick={() => setApproving(r)}>
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="xs"
                  loading={busyId === r.id}
                  onClick={() => void handleDecline(r)}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <details className="rounded-lg border border-black/10 bg-white shadow-card p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray">
            {resolved.length} resolved request{resolved.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {resolved.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {r.name} — {r.email}
                </span>
                <Badge tone={r.status === "approved" ? "success" : "danger"} size="sm">
                  {r.status}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title={approving ? `Approve ${approving.name}` : "Approve"}
      >
        {approving ? (
          <ApproveForm
            request={approving}
            onSaved={(request, result) => {
              onResolved(request);
              onPassword(request.email, result);
              setApproving(null);
            }}
            onCancel={() => setApproving(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function ApproveForm({
  request,
  onSaved,
  onCancel,
}: {
  request: AccessRequestDTO;
  onSaved: (request: AccessRequestDTO, result: GeneratedPasswordDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(approveRequestSchema, {
    defaultValues: { role: "Associate" },
    submit: (values) =>
      postJson<GeneratedPasswordDTO>(`/api/admin/access-requests/${request.id}/approve`, values),
    onSuccess: (data) => {
      toast.success(`${request.name} approved`);
      onSaved({ ...request, status: "approved" }, data);
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <p className="text-sm text-gray">
        Creates an account for <span className="font-semibold text-charcoal">{request.email}</span>{" "}
        with the role below and generates a one-time password.
      </p>
      <Field label="Role" htmlFor="ar-role" error={fieldError(form, "role")} required>
        <Select id="ar-role" {...form.register("role")}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Approve
        </Button>
      </div>
    </form>
  );
}
