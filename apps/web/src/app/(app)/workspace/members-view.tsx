"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ROLES } from "@destaworks/domain/constants";
import type { TenantMemberDTO } from "@destaworks/contracts/validation/tenant";
import { Badge } from "@destaworks/ui/badge";
import { Button } from "@destaworks/ui/button";
import { EmptyState } from "@destaworks/ui/empty-state";
import { Input } from "@destaworks/ui/input";
import { Table, Td } from "@destaworks/ui/table";
import { inviteMember, messageForFailure, removeMember } from "../lib/tenant-fetch";

const STATUS_TONE = { active: "success", invited: "amber", removed: "neutral" } as const;

/**
 * The roster plus its two actions.
 *
 * Removing YOURSELF is not offered: the server refuses it (it is how a workspace loses its last
 * administrator), and an action that always fails is worse than one that is absent.
 */
export function MembersView({
  initial,
  currentUserId,
}: {
  initial: TenantMemberDTO[];
  currentUserId: string;
}) {
  const [members, setMembers] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("Associate");
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await inviteMember({ email: email.trim(), role });
    setBusy(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    setMembers((rows) => [...rows, result.data.member]);
    setEmail("");
    toast.success(`Invited ${result.data.member.email} as ${result.data.member.role}`);
  }

  async function remove(member: TenantMemberDTO) {
    setBusy(true);
    const result = await removeMember(member.membershipId);
    setBusy(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    setMembers((rows) =>
      rows.map((r) => (r.membershipId === member.membershipId ? result.data.member : r)),
    );
    toast.success(`Removed ${member.name}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => void invite(e)}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white p-4"
      >
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-gray uppercase">Email</span>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@desta.works"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-gray uppercase">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="h-9 rounded-md border border-black/15 px-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy || email.trim() === ""}>
          Invite
        </Button>
      </form>

      {members.length === 0 ? (
        <EmptyState title="No members yet" description="Invite a colleague to get started." />
      ) : (
        <Table caption="Workspace members" columns={["Name", "Email", "Role", "Status", ""]}>
          {members.map((m) => (
            <tr key={m.membershipId} className="border-t border-black/5">
              <Td>
                <span className="font-medium text-navy">{m.name}</span>
                {m.userId === currentUserId ? (
                  <span className="ml-2 text-xs text-gray">you</span>
                ) : null}
              </Td>
              <Td>{m.email}</Td>
              <Td>{m.role}</Td>
              <Td>
                <Badge tone={STATUS_TONE[m.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                  {m.status}
                </Badge>
              </Td>
              <Td>
                {m.userId === currentUserId || m.status === "removed" ? null : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(m)}
                    className="text-sm font-semibold text-danger hover:underline disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
