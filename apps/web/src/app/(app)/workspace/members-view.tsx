"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AccessRoleDTO, TenantMemberDTO } from "@destaworks/contracts/validation/tenant";
import { Badge } from "@destaworks/ui/badge";
import { Button } from "@destaworks/ui/button";
import { EmptyState } from "@destaworks/ui/empty-state";
import { ErrorState } from "@destaworks/ui/error-state";
import { Field } from "@destaworks/ui/field";
import { Input } from "@destaworks/ui/input";
import { Modal } from "@destaworks/ui/modal";
import { Select } from "@destaworks/ui/select";
import { Table, Td } from "@destaworks/ui/table";
import {
  changeMemberRole,
  inviteMember,
  messageForFailure,
  removeMember,
} from "../lib/tenant-fetch";

const STATUS_TONE = { active: "success", invited: "amber", removed: "neutral" } as const;

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/10 text-xs font-semibold text-navy">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * The roster, its role control, and its two lifecycle actions.
 *
 * Changing a role is a SELECT in the row rather than a screen of its own: it is the most frequent
 * edit here and it now moves `Membership.roleId`, which is what every capability check reads.
 *
 * Removing YOURSELF is not offered, and neither is re-roling yourself — the server refuses both
 * (each is how a workspace loses its last administrator), and an action that always fails is worse
 * than one that is absent.
 */
export function MembersView({
  initial,
  roles,
  currentUserId,
}: {
  initial: TenantMemberDTO[];
  roles: AccessRoleDTO[];
  currentUserId: string;
}) {
  const [members, setMembers] = useState(initial);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const active = members.filter((m) => m.status === "active").length;
  const pending = members.filter((m) => m.status === "invited").length;

  function replace(member: TenantMemberDTO) {
    setMembers((rows) => rows.map((r) => (r.membershipId === member.membershipId ? member : r)));
  }

  async function onRoleChange(member: TenantMemberDTO, roleId: string) {
    const name = roles.find((r) => r.id === roleId)?.name ?? roleId;
    setBusyId(member.membershipId);
    const result = await changeMemberRole(member.membershipId, roleId);
    setBusyId(null);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    replace(result.data.member);
    toast.success(`${member.name} is now ${name}`);
  }

  async function onRemove(member: TenantMemberDTO) {
    setBusyId(member.membershipId);
    const result = await removeMember(member.membershipId);
    setBusyId(null);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    replace(result.data.member);
    toast.success(`${member.name} removed`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray">
          <span className="font-semibold text-charcoal">{active}</span> active
          {pending > 0 ? (
            <>
              {" · "}
              <span className="font-semibold text-charcoal">{pending}</span> awaiting acceptance
            </>
          ) : null}
        </p>
        <Button onClick={() => setInviting(true)}>Invite member</Button>
      </div>

      {members.length === 0 ? (
        <EmptyState title="No members yet" description="Invite a colleague to get started." />
      ) : (
        <Table caption="Workspace members" columns={["Member", "Role", "Status", ""]}>
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const isRemoved = m.status === "removed";
            return (
              <tr key={m.membershipId} className="border-t border-black/5">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.name} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-navy">{m.name}</span>
                        {isSelf ? (
                          <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-gray">
                            you
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-gray">{m.email}</span>
                    </div>
                  </div>
                </Td>
                <Td>
                  {isSelf || isRemoved ? (
                    <span className="text-sm text-charcoal">{m.role}</span>
                  ) : (
                    <Select
                      aria-label={`Role for ${m.name}`}
                      value={m.roleId}
                      disabled={busyId === m.membershipId}
                      onChange={(e) => void onRoleChange(m, e.target.value)}
                      className="h-8 w-40 text-xs"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[m.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                    {m.status}
                  </Badge>
                </Td>
                <Td className="text-right">
                  {isSelf || isRemoved ? null : (
                    <button
                      type="button"
                      disabled={busyId === m.membershipId}
                      onClick={() => void onRemove(m)}
                      className="text-sm font-semibold text-danger hover:underline disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {inviting ? (
        <InviteModal
          roles={roles}
          onInvited={(member) => {
            setMembers((rows) => [...rows, member]);
            setInviting(false);
          }}
          onClose={() => setInviting(false)}
        />
      ) : null}
    </div>
  );
}

function InviteModal({
  roles,
  onInvited,
  onClose,
}: {
  roles: AccessRoleDTO[];
  onInvited: (member: TenantMemberDTO) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const selected = roles.find((r) => r.id === roleId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setServerError(null);
    const result = await inviteMember({ email: email.trim(), roleId });
    setBusy(false);
    if (!result.ok) {
      setServerError(messageForFailure(result.failure));
      return;
    }
    toast.success(`Invited ${result.data.member.email} as ${result.data.member.role}`);
    onInvited(result.data.member);
  }

  return (
    <Modal open onClose={onClose} title="Invite a member" dismissBlocked={busy}>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        {serverError ? <ErrorState message={serverError} /> : null}

        <p className="text-sm text-gray">
          They need an account already. The invitation grants nothing until they accept it.
        </p>

        <Field label="Email" htmlFor="invite-email" required>
          <Input
            id="invite-email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@desta.works"
          />
        </Field>

        <Field label="Role" htmlFor="invite-role" required>
          <Select id="invite-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>

        {selected ? (
          <p className="rounded-md bg-black/[0.03] px-3 py-2 text-xs text-gray">
            {selected.capabilities.length === 0
              ? "Grants no elevated permissions."
              : `Grants ${selected.capabilities.length} permission${
                  selected.capabilities.length === 1 ? "" : "s"
                }.`}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || email.trim() === "" || roleId === ""}>
            Send invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
