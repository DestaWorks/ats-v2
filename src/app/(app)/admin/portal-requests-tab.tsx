"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  approvePortalRequestSchema,
  type GeneratedPortalLinkDTO,
  type PortalAccessRequestDTO,
} from "@/lib/validation/portal";
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

/** Shown once after generating a portal link — the plaintext token is never re-fetchable. */
export function GeneratedPortalLinkBanner({
  fullName,
  token,
  onDismiss,
}: {
  fullName: string;
  token: string;
  onDismiss: () => void;
}) {
  const link =
    typeof window !== "undefined" ? `${window.location.origin}/portal/access?token=${token}` : "";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber bg-amber/10 p-3">
      <p className="text-sm text-charcoal">
        Portal link for <span className="font-semibold">{fullName}</span>:{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs break-all">{link}</code> —
        send it now, it won&apos;t be shown again.
      </p>
      <Button type="button" variant="secondary" size="xs" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

export function PortalRequestsTab({
  pending,
  resolved,
  clients,
  onResolved,
  onLinkGenerated,
}: {
  pending: PortalAccessRequestDTO[];
  resolved: PortalAccessRequestDTO[];
  clients: { id: string; name: string }[];
  onResolved: (request: PortalAccessRequestDTO) => void;
  onLinkGenerated: (link: { fullName: string; token: string }) => void;
}) {
  const [approving, setApproving] = useState<PortalAccessRequestDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDecline(request: PortalAccessRequestDTO) {
    if (!window.confirm(`Decline the request from ${request.name}?`)) return;
    setBusyId(request.id);
    const res = await postJson<{ ok: true }>(
      `/api/admin/portal/requests/${request.id}/decline`,
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
        <EmptyState
          title="No pending requests"
          description="Client portal-access requests appear here."
        />
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
                  Requested client: {r.requestedClientName}
                  {r.note ? ` · ${r.note}` : ""}
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
          <ApprovePortalRequestForm
            request={approving}
            clients={clients}
            onSaved={(request, link) => {
              onResolved(request);
              onLinkGenerated(link);
              setApproving(null);
            }}
            onCancel={() => setApproving(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function ApprovePortalRequestForm({
  request,
  clients,
  onSaved,
  onCancel,
}: {
  request: PortalAccessRequestDTO;
  clients: { id: string; name: string }[];
  onSaved: (request: PortalAccessRequestDTO, link: { fullName: string; token: string }) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(approvePortalRequestSchema, {
    submit: (values) =>
      postJson<GeneratedPortalLinkDTO>(`/api/admin/portal/requests/${request.id}/approve`, values),
    onSuccess: (data) => {
      toast.success(`${request.name} approved`);
      onSaved(
        { ...request, status: "approved" },
        { fullName: data.contact.fullName, token: data.token },
      );
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <p className="text-sm text-gray">
        Creates a new contact for{" "}
        <span className="font-semibold text-charcoal">{request.email}</span> under the client below,
        and generates them a one-time portal link. They requested:{" "}
        <span className="font-medium text-charcoal">{request.requestedClientName}</span>.
      </p>
      <Field label="Client" htmlFor="apr-client" error={fieldError(form, "clientId")} required>
        <Select id="apr-client" {...form.register("clientId")}>
          <option value="">Select…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
