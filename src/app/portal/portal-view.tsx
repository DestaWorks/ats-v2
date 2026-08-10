"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CREDENTIALS, POPULATIONS, ROLE_PRIORITIES, SETTINGS, US_STATES } from "@/lib/constants";
import {
  postPortalRoleSchema,
  type PortalDataDTO,
  type PortalRoleDTO,
} from "@/lib/validation/portal";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { postJson } from "@/lib/api/client";
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

export function PortalView({ initial }: { initial: PortalDataDTO }) {
  const [roles, setRoles] = useState(initial.roles);
  const [postOpen, setPostOpen] = useState(false);
  const { client, contact, candidates } = initial;

  const tabs: TabDef[] = [
    {
      key: "candidates",
      label: `Candidates (${candidates.length})`,
      panel:
        candidates.length === 0 ? (
          <EmptyState title="No candidates yet" description="Submitted candidates appear here." />
        ) : (
          <Table
            caption="Candidates"
            columns={[
              "Name",
              "Credential",
              "State",
              "Status",
              "Location",
              "Experience",
              "Employer",
            ]}
          >
            {candidates.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium text-charcoal">{c.name}</Td>
                <Td>{c.credential ?? "—"}</Td>
                <Td>{c.licenseState ?? "—"}</Td>
                <Td>
                  <Badge tone="navy" size="sm">
                    {c.status}
                  </Badge>
                </Td>
                <Td>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</Td>
                <Td>{c.yearsExp != null ? `${c.yearsExp} yrs` : "—"}</Td>
                <Td>{c.employer ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        ),
    },
    {
      key: "roles",
      label: `Open Roles (${roles.length})`,
      panel: (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button type="button" variant="success" size="sm" onClick={() => setPostOpen(true)}>
              + Post a role
            </Button>
          </div>
          {roles.length === 0 ? (
            <EmptyState title="No open roles" description="Post a role to get started." />
          ) : (
            <ul className="flex flex-col gap-2">
              {roles.map((r) => (
                <RoleCard key={r.id} role={r} />
              ))}
            </ul>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-6">
      <header>
        <h1 className="font-serif text-2xl font-bold text-charcoal">{client.name}</h1>
        <p className="text-sm text-gray">Welcome, {contact.fullName}.</p>
      </header>

      <DetailTabs tabs={tabs} ariaLabel="Client portal" />

      <Modal open={postOpen} onClose={() => setPostOpen(false)} title="Post a role">
        {postOpen ? (
          <PostRoleForm
            onSaved={(role) => {
              setRoles((prev) => [...prev, role]);
              setPostOpen(false);
            }}
            onCancel={() => setPostOpen(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function RoleCard({ role }: { role: PortalRoleDTO }) {
  return (
    <li className="rounded-lg border border-black/5 bg-white shadow-card p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-charcoal">{role.title}</span>
        <Badge tone="neutral" size="sm">
          {role.priority}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-gray">
        {[role.credential, role.state, role.city, role.setting].filter(Boolean).join(" · ") || "—"}
      </p>
      {role.rate ? <p className="mt-1 text-xs text-gray">Rate: {role.rate}</p> : null}
      {role.description ? <p className="mt-2 text-sm text-charcoal">{role.description}</p> : null}
    </li>
  );
}

/** Posted roles don't come back with a full `PortalRoleDTO` (the write route only returns `{id}`),
 *  so the new card is built optimistically from the submitted values instead of a server echo. */
function PostRoleForm({
  onSaved,
  onCancel,
}: {
  onSaved: (role: PortalRoleDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(postPortalRoleSchema, {
    defaultValues: { title: "", priority: "P2" },
    submit: (values) => postJson<{ role: { id: string } }>("/api/portal/roles", values),
    onSuccess: (data, values) => {
      toast.success("Role posted");
      onSaved({
        id: data.role.id,
        title: values.title,
        credential: values.credential ?? null,
        state: values.state ?? null,
        city: values.city ?? null,
        setting: values.setting ?? null,
        rate: values.rate ?? null,
        description: values.description ?? null,
        priority: values.priority,
        status: "Open",
        openedAt: new Date().toISOString(),
      });
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <Field label="Title" htmlFor="pr-title" required>
        <Input id="pr-title" autoFocus {...form.register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Credential" htmlFor="pr-credential">
          <Select id="pr-credential" {...form.register("credential", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {CREDENTIALS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="State" htmlFor="pr-state">
          <Select id="pr-state" {...form.register("state", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="pr-city">
          <Input id="pr-city" {...form.register("city", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Setting" htmlFor="pr-setting">
          <Select id="pr-setting" {...form.register("setting", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Population" htmlFor="pr-population">
          <Select id="pr-population" {...form.register("population", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {POPULATIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate" htmlFor="pr-rate">
          <Input
            id="pr-rate"
            placeholder="e.g. $75-90/hr"
            {...form.register("rate", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Priority" htmlFor="pr-priority">
          <Select id="pr-priority" {...form.register("priority")}>
            {ROLE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="pr-description">
        <textarea
          id="pr-description"
          rows={4}
          className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
          {...form.register("description", { setValueAs: emptyToNull })}
        />
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Post Role
        </Button>
      </div>
    </form>
  );
}
