"use client";

import { useState } from "react";
import { CAPABILITIES } from "@destaworks/domain/constants";
import type { AccessRoleDTO } from "@destaworks/contracts/validation/tenant";
import type { AdminUserDTO } from "@destaworks/contracts/validation/admin";
import { Button } from "@destaworks/ui/button";
import { Td } from "@destaworks/ui/table";
import { RoleEditor } from "./role-editor";

/** Legacy `AdminView`'s `ROLE_COLORS` parity, remapped onto this app's own general-purpose color
 *  tokens (not the candidate-status palette, which is semantically reserved for pipeline stages).
 *  Owner/Admin share every capability (`ROLE_CAPABILITIES`) but stay visually distinct — they're
 *  still separate account types. */
const BUILT_IN_COLOR: Record<string, string> = {
  Owner: "brand",
  Admin: "teal",
  Director: "navy",
  Manager: "purple",
  Screener: "orange",
  Associate: "gray",
};

/** A workspace may invent roles the palette above never heard of; those take the neutral token. */
function colorFor(role: AccessRoleDTO): string {
  return (role.templateKey ? BUILT_IN_COLOR[role.templateKey] : undefined) ?? "gray";
}

/** Derived from the row's ACTUAL capabilities — copy went stale and could not describe a
 *  customer's invented role. */
function describe(role: AccessRoleDTO): string {
  if (role.capabilities.length === 0) return "Core recruiting access. No elevated permissions.";
  if (role.capabilities.length === CAPABILITIES.length) {
    return "Full access — every permission in the workspace.";
  }
  return `${role.capabilities.length} of ${CAPABILITIES.length} permissions.`;
}

/** Small circular avatar — the real uploaded photo when present (Wave 6), matching the header
 *  avatar's treatment (`user-menu.tsx`), falling back to an initial otherwise. */
function Avatar({ name, image }: { name: string; image: string | null }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a user-uploaded Storage URL, not a static asset
      <img
        src={image}
        alt=""
        title={name}
        className="h-6 w-6 shrink-0 rounded-full object-cover ring-2 ring-white"
      />
    );
  }
  return (
    <span
      title={name}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy/10 text-[11px] font-bold text-navy ring-2 ring-white"
    >
      {initial}
    </span>
  );
}

const MAX_AVATARS = 5;

function RoleCard({
  role,
  members,
  onEdit,
}: {
  role: AccessRoleDTO;
  members: AdminUserDTO[];
  onEdit?: (() => void) | undefined;
}) {
  const color = colorFor(role);
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-black/[0.06] py-2.5 pr-3 pl-3"
      style={{ borderLeft: `4px solid var(--color-${color})` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: `var(--color-${color})` }}
          >
            {role.name}
          </span>
          <span className="text-[11px] font-semibold text-charcoal">
            {members.length} user{members.length !== 1 ? "s" : ""}
          </span>
          {role.isBuiltIn ? null : (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-gray">
              Custom
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-gray">{describe(role)}</p>
      </div>
      {onEdit ? (
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
      ) : null}
      {members.length > 0 ? (
        <div className="flex -space-x-1.5">
          {members.slice(0, MAX_AVATARS).map((m) => (
            <Avatar key={m.id} name={m.name || m.email} image={m.image} />
          ))}
          {members.length > MAX_AVATARS ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] font-semibold text-gray ring-2 ring-white">
              +{members.length - MAX_AVATARS}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The workspace's roles, who holds each, and the permission matrix — read from the TENANT'S rows,
 * so a renamed or invented role appears exactly as the guards see it.
 */
export function RolesTab({
  users,
  roles: initialRoles,
  canManageRoles,
  ownedModules,
  grantable,
}: {
  users: AdminUserDTO[];
  roles: AccessRoleDTO[];
  /** `manageRoles`. Without it the screen is a read-only answer to "who can do what". */
  canManageRoles: boolean;
  ownedModules: readonly string[];
  grantable: readonly string[];
}) {
  const [roles, setRoles] = useState(initialRoles);
  // `null` is closed; `{ role: null }` is "create" — two states a plain nullable cannot hold.
  const [editing, setEditing] = useState<{ role: AccessRoleDTO | null } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-wide text-navy uppercase">Role Management</h3>
          {canManageRoles ? (
            <Button size="sm" onClick={() => setEditing({ role: null })}>
              New role
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              members={users.filter((u) => u.roleId === role.id)}
              onEdit={canManageRoles ? () => setEditing({ role }) : undefined}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-sm font-bold tracking-wide text-navy uppercase">
          Permission Matrix
        </h3>
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-card">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-navy">
                <th scope="col" className="px-3 py-2.5 text-[13px] font-semibold text-white">
                  Capability
                </th>
                {roles.map((r) => (
                  <th
                    key={r.id}
                    scope="col"
                    className="px-3 py-2.5 text-center text-[13px] font-semibold text-white"
                  >
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {CAPABILITIES.map((cap) => (
                <tr key={cap} className="hover:bg-black/[0.02]">
                  <Td className="font-medium text-charcoal">{cap}</Td>
                  {roles.map((r) => (
                    <Td key={r.id} className="text-center">
                      {r.capabilities.includes(cap) ? (
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
      </div>

      {editing ? (
        <RoleEditor
          role={editing.role}
          ownedModules={ownedModules}
          grantable={grantable}
          onSaved={(saved) => {
            setRoles((prev) =>
              prev.some((r) => r.id === saved.id)
                ? prev.map((r) => (r.id === saved.id ? saved : r))
                : [...prev, saved],
            );
            setEditing(null);
          }}
          onDeleted={(id) => {
            setRoles((prev) => prev.filter((r) => r.id !== id));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
