"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CAPABILITIES, ROLES, ROLE_CAPABILITIES } from "@/lib/constants";
import {
  approveRequestSchema,
  banUserSchema,
  createUserSchema,
  type AccessRequestDTO,
  type AdminUserDTO,
  type GeneratedPasswordDTO,
} from "@/lib/validation/admin";
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
import { Table, Td } from "@/components/ui/table";
import { fieldError } from "../candidates/[id]/lib/form-error";

/** Shown once after any action that mints a plaintext password — never re-fetchable. */
function GeneratedPasswordBanner({
  email,
  password,
  onDismiss,
}: {
  email: string;
  password: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber bg-amber/10 p-3">
      <p className="text-sm text-charcoal">
        Password for <span className="font-semibold">{email}</span>:{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm">{password}</code> — share
        it now, it won&apos;t be shown again.
      </p>
      <Button type="button" variant="secondary" size="xs" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

export function AdminDashboard({
  initialUsers,
  initialRequests,
  currentUserId,
}: {
  initialUsers: AdminUserDTO[];
  initialRequests: AccessRequestDTO[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [requests, setRequests] = useState(initialRequests);
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null);

  function upsertUser(user: AdminUserDTO) {
    const exists = users.some((u) => u.id === user.id);
    setUsers((prev) => (exists ? prev.map((u) => (u.id === user.id ? user : u)) : [user, ...prev]));
  }

  function announcePassword(email: string, result: { generatedPassword: string | null }) {
    if (result.generatedPassword) setGenerated({ email, password: result.generatedPassword });
  }

  const blocked = users.filter((u) => u.banned);
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const resolvedRequests = requests.filter((r) => r.status !== "pending");

  const tabs: TabDef[] = [
    {
      key: "users",
      label: `Users (${users.length})`,
      panel: (
        <UsersTab
          users={users}
          currentUserId={currentUserId}
          onChanged={upsertUser}
          onRemoved={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
          onPassword={announcePassword}
        />
      ),
    },
    {
      key: "requests",
      label: `Access Requests (${pendingRequests.length})`,
      panel: (
        <AccessRequestsTab
          pending={pendingRequests}
          resolved={resolvedRequests}
          onResolved={(req) => setRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)))}
          onPassword={announcePassword}
        />
      ),
    },
    { key: "roles", label: "Roles", panel: <RolesTab /> },
    {
      key: "blocked",
      label: `Blocked (${blocked.length})`,
      panel: (
        <UsersTab
          users={blocked}
          currentUserId={currentUserId}
          onChanged={upsertUser}
          onRemoved={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
          onPassword={announcePassword}
          emptyMessage="No accounts are currently blocked."
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Admin</h1>
        <p className="text-sm text-gray">Manage accounts, access requests, and role permissions.</p>
      </header>

      {generated ? (
        <GeneratedPasswordBanner
          email={generated.email}
          password={generated.password}
          onDismiss={() => setGenerated(null)}
        />
      ) : null}

      <DetailTabs tabs={tabs} ariaLabel="Admin" />
    </div>
  );
}

// --- Users tab ---------------------------------------------------------

function UsersTab({
  users,
  currentUserId,
  onChanged,
  onRemoved,
  onPassword,
  emptyMessage = "No users yet.",
}: {
  users: AdminUserDTO[];
  currentUserId: string;
  onChanged: (user: AdminUserDTO) => void;
  onRemoved: (id: string) => void;
  onPassword: (email: string, result: { generatedPassword: string | null }) => void;
  emptyMessage?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<AdminUserDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleRoleChange(user: AdminUserDTO, role: string) {
    setBusyId(user.id);
    const res = await patchJson<{ user: AdminUserDTO }>(`/api/admin/users/${user.id}/role`, {
      role,
    });
    setBusyId(null);
    if (res.ok) {
      toast.success(`${user.name} is now ${role}`);
      onChanged(res.data.user);
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleUnban(user: AdminUserDTO) {
    setBusyId(user.id);
    const res = await postJson<{ user: AdminUserDTO }>(`/api/admin/users/${user.id}/unban`, {});
    setBusyId(null);
    if (res.ok) {
      toast.success(`${user.name} unbanned`);
      onChanged(res.data.user);
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleResetPassword(user: AdminUserDTO) {
    if (!window.confirm(`Reset ${user.name}'s password? Their current password stops working.`)) {
      return;
    }
    setBusyId(user.id);
    const res = await postJson<{ generatedPassword: string }>(
      `/api/admin/users/${user.id}/reset-password`,
      {},
    );
    setBusyId(null);
    if (res.ok) {
      toast.success("Password reset");
      onPassword(user.email, res.data);
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleRemove(user: AdminUserDTO) {
    if (!window.confirm(`Remove ${user.name}'s account? This cannot be undone.`)) return;
    setBusyId(user.id);
    const res = await deleteJson(`/api/admin/users/${user.id}`);
    setBusyId(null);
    if (res.ok) {
      toast.success("Account removed");
      onRemoved(user.id);
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray">
          {users.length} account{users.length === 1 ? "" : "s"}
        </p>
        <Button type="button" variant="success" size="sm" onClick={() => setAddOpen(true)}>
          + Add User
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState title="Nothing here" description={emptyMessage} />
      ) : (
        <Table caption="Accounts" columns={["Name", "Email", "Role", "Status", "Actions"]}>
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-black/[0.02]">
              <Td className="font-medium text-charcoal">{u.name}</Td>
              <Td>{u.email}</Td>
              <Td>
                <Select
                  value={u.role}
                  disabled={busyId === u.id}
                  onChange={(e) => void handleRoleChange(u, e.target.value)}
                  className="h-8 text-xs"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Td>
              <Td>
                {u.banned ? (
                  <Badge tone="danger" size="sm">
                    Blocked{u.banReason ? `: ${u.banReason}` : ""}
                  </Badge>
                ) : (
                  <Badge tone="success" size="sm">
                    Active
                  </Badge>
                )}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  {u.banned ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      loading={busyId === u.id}
                      onClick={() => void handleUnban(u)}
                    >
                      Unblock
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={u.id === currentUserId}
                      onClick={() => setBanTarget(u)}
                    >
                      Block
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    loading={busyId === u.id}
                    onClick={() => void handleResetPassword(u)}
                  >
                    Reset password
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="xs"
                    disabled={u.id === currentUserId}
                    loading={busyId === u.id}
                    onClick={() => void handleRemove(u)}
                  >
                    Remove
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add user">
        {addOpen ? (
          <AddUserForm
            onSaved={(result) => {
              onChanged(result.user);
              onPassword(result.user.email, result);
              setAddOpen(false);
            }}
            onCancel={() => setAddOpen(false)}
          />
        ) : null}
      </Modal>

      <Modal open={banTarget !== null} onClose={() => setBanTarget(null)} title="Block user">
        {banTarget ? (
          <BanForm
            user={banTarget}
            onSaved={(user) => {
              onChanged(user);
              setBanTarget(null);
            }}
            onCancel={() => setBanTarget(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function AddUserForm({
  onSaved,
  onCancel,
}: {
  onSaved: (result: GeneratedPasswordDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(createUserSchema, {
    defaultValues: { name: "", email: "", role: "Associate" },
    submit: (values) => postJson<GeneratedPasswordDTO>("/api/admin/users", values),
    onSuccess: (data) => {
      toast.success("User added");
      onSaved(data);
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <Field label="Name" htmlFor="au-name" error={fieldError(form, "name")} required>
        <Input id="au-name" autoFocus {...form.register("name")} />
      </Field>
      <Field label="Email" htmlFor="au-email" error={fieldError(form, "email")} required>
        <Input id="au-email" type="email" {...form.register("email")} />
      </Field>
      <Field label="Role" htmlFor="au-role" error={fieldError(form, "role")} required>
        <Select id="au-role" {...form.register("role")}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Password (optional)" htmlFor="au-password" error={fieldError(form, "password")}>
        <Input
          id="au-password"
          type="text"
          placeholder="Leave blank to auto-generate"
          {...form.register("password", { setValueAs: emptyToNull })}
        />
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add User
        </Button>
      </div>
    </form>
  );
}

function BanForm({
  user,
  onSaved,
  onCancel,
}: {
  user: AdminUserDTO;
  onSaved: (user: AdminUserDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(banUserSchema, {
    defaultValues: {},
    submit: (values) => postJson<{ user: AdminUserDTO }>(`/api/admin/users/${user.id}/ban`, values),
    onSuccess: (data) => {
      toast.success(`${user.name} blocked`);
      onSaved(data.user);
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <p className="text-sm text-gray">
        Blocking <span className="font-semibold text-charcoal">{user.name}</span> immediately
        revokes their sessions and prevents sign-in.
      </p>
      <Field label="Reason (optional)" htmlFor="bf-reason" error={fieldError(form, "reason")}>
        <Input id="bf-reason" {...form.register("reason", { setValueAs: emptyToNull })} />
      </Field>
      <Field
        label="Expires in (days, optional)"
        htmlFor="bf-expires"
        error={fieldError(form, "expiresInDays")}
      >
        <Input
          id="bf-expires"
          type="number"
          placeholder="Leave blank for permanent"
          {...form.register("expiresInDays", {
            setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
          })}
        />
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={pending}>
          Block User
        </Button>
      </div>
    </form>
  );
}

// --- Access requests tab -------------------------------------------------

function AccessRequestsTab({
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 bg-white p-3"
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
        <details className="rounded-lg border border-black/10 bg-white p-3">
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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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

// --- Roles tab (read-only) ------------------------------------------------

function RolesTab() {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-navy">
            <th scope="col" className="px-3 py-2.5 text-[13px] font-semibold text-white">
              Capability
            </th>
            {ROLES.map((r) => (
              <th
                key={r}
                scope="col"
                className="px-3 py-2.5 text-center text-[13px] font-semibold text-white"
              >
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {CAPABILITIES.map((cap) => (
            <tr key={cap} className="hover:bg-black/[0.02]">
              <Td className="font-medium text-charcoal">{cap}</Td>
              {ROLES.map((r) => (
                <Td key={r} className="text-center">
                  {ROLE_CAPABILITIES[r].includes(cap) ? (
                    <span aria-label="Granted" className="text-green">
                      ✓
                    </span>
                  ) : (
                    <span aria-label="Not granted" className="text-black/15">
                      —
                    </span>
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
