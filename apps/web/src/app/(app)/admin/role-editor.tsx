"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CAPABILITIES,
  CAPABILITY_MODULE,
  MODULES,
  MODULE_LABEL,
  ROLES,
  ROLE_CAPABILITIES,
  type Capability,
} from "@destaworks/domain/constants";
import type { AccessRoleDTO } from "@destaworks/contracts/validation/tenant";
import { Button } from "@destaworks/ui/button";
import { ErrorState } from "@destaworks/ui/error-state";
import { Field } from "@destaworks/ui/field";
import { Input } from "@destaworks/ui/input";
import { Modal } from "@destaworks/ui/modal";
import { Select } from "@destaworks/ui/select";
import { createRole, deleteRole, messageForFailure, updateRole } from "../lib/tenant-fetch";

/**
 * Creating and editing a workspace's roles. Assumes nothing: every guard shown here is re-run in
 * `accessRoleService`, and the last-administrator one cannot be expressed in a form at all.
 *
 * A new role is a CLONE, never blank. Permissions are grouped by module, and one whose module the
 * workspace has not bought is MARKED rather than hidden — hiding would make the role silently
 * grant more than the screen said the day that module is added.
 */

const CHECK = "h-4 w-4 shrink-0 rounded border-black/20";

// `key` rather than `module`: Next.js bans `module` as a binding name, and this is the grouping
// key for a section heading either way.
function capabilitiesByModule(): {
  key: (typeof MODULES)[number];
  capabilities: Capability[];
}[] {
  return MODULES.map((key) => ({
    key,
    capabilities: CAPABILITIES.filter((c) => CAPABILITY_MODULE[c] === key),
  })).filter((group) => group.capabilities.length > 0);
}

export function RoleEditor({
  role,
  ownedModules,
  grantable,
  onSaved,
  onDeleted,
  onClose,
}: {
  /** The role being edited, or null to create one from a template. */
  role: AccessRoleDTO | null;
  /** What the workspace has bought — used to MARK permissions, never to hide them. */
  ownedModules: readonly string[];
  /** What the signed-in member holds. The server refuses anything beyond it; this greys it first. */
  grantable: readonly string[];
  onSaved: (role: AccessRoleDTO) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [template, setTemplate] = useState<(typeof ROLES)[number]>("Associate");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role?.capabilities ?? ROLE_CAPABILITIES.Associate),
  );
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function cloneFrom(next: (typeof ROLES)[number]) {
    setTemplate(next);
    setSelected(new Set(ROLE_CAPABILITIES[next]));
  }

  function toggle(capability: Capability) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(capability)) next.delete(capability);
      else next.add(capability);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setServerError(null);
    const input = { name: name.trim(), capabilities: [...selected] };
    const result = role ? await updateRole(role.id, input) : await createRole(input);
    setBusy(false);
    if (!result.ok) {
      setServerError(messageForFailure(result.failure));
      return;
    }
    toast.success(role ? `${result.data.role.name} updated` : `${result.data.role.name} created`);
    onSaved(result.data.role);
  }

  async function remove() {
    if (!role) return;
    setBusy(true);
    setServerError(null);
    const result = await deleteRole(role.id);
    setBusy(false);
    if (!result.ok) {
      setServerError(messageForFailure(result.failure));
      return;
    }
    toast.success(`${role.name} deleted`);
    onDeleted(role.id);
  }

  return (
    <Modal open onClose={onClose} title={role ? `Edit ${role.name}` : "New role"}>
      <div className="flex flex-col gap-4">
        {serverError ? <ErrorState message={serverError} /> : null}

        <Field label="Name" htmlFor="role-name" required>
          <Input
            id="role-name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Recruiter"
          />
        </Field>

        {role ? null : (
          <Field
            label="Start from"
            htmlFor="role-template"
            hint="A new role is a copy of an existing one. Adjust it below."
          >
            <Select
              id="role-template"
              value={template}
              onChange={(e) => cloneFrom(e.target.value as (typeof ROLES)[number])}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold tracking-wide text-gray uppercase">
            Permissions ({selected.size} of {CAPABILITIES.length})
          </span>
          {capabilitiesByModule().map(({ key, capabilities }) => {
            const owned = ownedModules.includes(key);
            return (
              <fieldset key={key} className="rounded-lg border border-black/10 p-3">
                <legend className="px-1 text-[11px] font-semibold text-charcoal">
                  {MODULE_LABEL[key]}
                  {owned ? null : (
                    <span className="ml-1.5 font-normal text-gray">— not on your plan</span>
                  )}
                </legend>
                <div className="mt-1 flex flex-col gap-1.5">
                  {capabilities.map((capability) => {
                    const beyondYou = !grantable.includes(capability);
                    return (
                      <label
                        key={capability}
                        className={`flex items-center gap-2 text-[13px] ${
                          beyondYou ? "text-gray" : "text-charcoal"
                        }`}
                        title={
                          beyondYou ? "You can't grant a permission you don't have yourself" : ""
                        }
                      >
                        <input
                          type="checkbox"
                          className={CHECK}
                          checked={selected.has(capability)}
                          disabled={beyondYou || busy}
                          onChange={() => toggle(capability)}
                        />
                        {capability}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            {role && !role.isBuiltIn ? (
              <Button variant="danger" onClick={() => void remove()} disabled={busy}>
                Delete
              </Button>
            ) : null}
            {role?.isBuiltIn ? (
              <span className="text-[11px] text-gray">
                Built-in roles can be edited but not deleted.
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy || name.trim() === ""}>
              {role ? "Save" : "Create role"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
