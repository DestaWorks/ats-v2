"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CREDENTIALS,
  POPULATIONS,
  ROLE_NOTE_CATEGORIES,
  ROLE_PRIORITIES,
  ROLE_STATUSES,
  SETTINGS,
  US_STATES,
} from "@/lib/constants";
import {
  addRoleNoteSchema,
  updateOpenRoleSchema,
  type AddRoleNoteInput,
  type ClientMatchProfileDTO,
  type OpenRoleDetailDTO,
  type RoleMatchDTO,
  type SaveMatchProfileInput,
  type UpdateOpenRoleInput,
} from "@/lib/validation/open-role";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import {
  deleteJson,
  getJson,
  messageForFailure,
  patchJson,
  postJson,
  putJson,
} from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailTabs, type TabDef } from "@/components/ui/tabs";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { fieldError } from "../../candidates/[id]/lib/form-error";
import { PRIORITY_TONE, STATUS_TONE } from "../lib/role-style";

export function RoleDetail({
  initial,
  matches,
  dormantMatches,
  clients,
  canManageWeights,
}: {
  initial: OpenRoleDetailDTO;
  matches: RoleMatchDTO[];
  dormantMatches: RoleMatchDTO[];
  clients: { id: string; name: string }[];
  canManageWeights: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Permanently delete "${role.title}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const res = await deleteJson(`/api/roles/${role.id}`);
      if (res.ok) {
        toast.success("Role deleted");
        router.push("/roles");
      } else {
        toast.error("Could not delete this role");
      }
    });
  }

  const tabs: TabDef[] = [
    {
      key: "matches",
      label: `Matches (${matches.length})`,
      panel: (
        <MatchesPanel
          roleId={role.id}
          clientId={role.clientId}
          matches={matches}
          canManageWeights={canManageWeights}
          onPromoted={() => router.refresh()}
        />
      ),
    },
    {
      key: "dormant",
      label: `Re-engage (${dormantMatches.length})`,
      panel: (
        <MatchesPanel
          roleId={role.id}
          clientId={role.clientId}
          matches={dormantMatches}
          canManageWeights={false}
          onPromoted={() => router.refresh()}
        />
      ),
    },
    {
      key: "notes",
      label: `Notes (${role.notes.length})`,
      panel: <NotesPanel role={role} onChanged={setRole} />,
    },
  ];

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <Link href="/roles" className="text-sm font-semibold text-navy hover:underline">
        ← Back to Open Roles
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[role.status]}>{role.status}</Badge>
            <Badge tone={PRIORITY_TONE[role.priority]}>{role.priority}</Badge>
          </div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">{role.title}</h1>
          <p className="text-sm text-gray">{role.clientName}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? "Cancel edit" : "Edit"}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={deleting}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </header>

      {editing ? (
        <EditRoleForm
          role={role}
          clients={clients}
          onSaved={(r) => {
            setRole(r);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="grid gap-3 rounded-lg border border-black/10 bg-white p-4 sm:grid-cols-3">
          <SummaryField label="Credential" value={role.credential} />
          <SummaryField label="State" value={role.state} />
          <SummaryField label="City" value={role.city} />
          <SummaryField label="Setting" value={role.setting} />
          <SummaryField label="Population" value={role.population} />
          <SummaryField label="Rate" value={role.rate} />
          {role.description ? (
            <p className="text-sm text-charcoal sm:col-span-3">{role.description}</p>
          ) : null}
        </div>
      )}

      <DetailTabs tabs={tabs} ariaLabel="Role detail" />
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-gray uppercase">{label}</p>
      <p className="text-sm text-charcoal">{value ?? "—"}</p>
    </div>
  );
}

function EditRoleForm({
  role,
  clients,
  onSaved,
  onCancel,
}: {
  role: OpenRoleDetailDTO;
  clients: { id: string; name: string }[];
  onSaved: (role: OpenRoleDetailDTO) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useZodForm(updateOpenRoleSchema, {
    // The DTO stores these as plain strings; they're only ever written through the validated
    // create/update schemas, so it's safe to narrow back to the enum types here.
    defaultValues: {
      title: role.title,
      credential: role.credential as UpdateOpenRoleInput["credential"],
      state: role.state as UpdateOpenRoleInput["state"],
      city: role.city,
      setting: role.setting as UpdateOpenRoleInput["setting"],
      population: role.population as UpdateOpenRoleInput["population"],
      rate: role.rate,
      description: role.description,
      priority: role.priority,
      status: role.status,
      clientId: role.clientId,
    },
  });

  function onSubmit(values: UpdateOpenRoleInput) {
    setServerError(null);
    startTransition(async () => {
      const res = await patchJson<{ role: OpenRoleDetailDTO }>(`/api/roles/${role.id}`, values);
      if (res.ok) {
        toast.success("Role updated");
        onSaved(res.data.role);
      } else if (res.failure.issues.length) {
        for (const issue of res.failure.issues) {
          form.setError(issue.path as keyof UpdateOpenRoleInput, { message: issue.message });
        }
        toast.error("Please fix the highlighted fields");
      } else {
        setServerError(messageForFailure(res.failure));
        toast.error(messageForFailure(res.failure));
      }
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-4"
    >
      {serverError ? <ErrorState message={serverError} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Target client" htmlFor="er-client" error={fieldError(form, "clientId")}>
          <Select id="er-client" {...form.register("clientId")}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Title"
          htmlFor="er-title"
          error={fieldError(form, "title")}
          className="sm:col-span-2"
        >
          <Input id="er-title" {...form.register("title")} />
        </Field>
        <Field label="Status" htmlFor="er-status" error={fieldError(form, "status")}>
          <Select id="er-status" {...form.register("status")}>
            {ROLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="er-priority" error={fieldError(form, "priority")}>
          <Select id="er-priority" {...form.register("priority")}>
            {ROLE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Credential" htmlFor="er-cred" error={fieldError(form, "credential")}>
          <Select id="er-cred" {...form.register("credential", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {CREDENTIALS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="State" htmlFor="er-state" error={fieldError(form, "state")}>
          <Select id="er-state" {...form.register("state", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="er-city" error={fieldError(form, "city")}>
          <Input id="er-city" {...form.register("city", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Setting" htmlFor="er-setting" error={fieldError(form, "setting")}>
          <Select id="er-setting" {...form.register("setting", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Population" htmlFor="er-population" error={fieldError(form, "population")}>
          <Select id="er-population" {...form.register("population", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {POPULATIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate" htmlFor="er-rate" error={fieldError(form, "rate")}>
          <Input id="er-rate" {...form.register("rate", { setValueAs: emptyToNull })} />
        </Field>
        <Field
          label="Description"
          htmlFor="er-description"
          error={fieldError(form, "description")}
          className="sm:col-span-3"
        >
          <textarea
            id="er-description"
            rows={3}
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            {...form.register("description", { setValueAs: emptyToNull })}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-3">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function MatchesPanel({
  roleId,
  clientId,
  matches,
  canManageWeights,
  onPromoted,
}: {
  roleId: string;
  clientId: string;
  matches: RoleMatchDTO[];
  canManageWeights: boolean;
  onPromoted: () => void;
}) {
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [showWeights, setShowWeights] = useState(false);

  async function handlePromote(leadId: string) {
    setPromotingId(leadId);
    const result = await postJson<{ candidateId: string }>(`/api/roles/${roleId}/promote`, {
      leadId,
    });
    setPromotingId(null);
    if (result.ok) {
      toast.success("Promoted into the pipeline");
      onPromoted();
    } else {
      toast.error(messageForFailure(result.failure));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canManageWeights ? (
        <div className="self-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowWeights((s) => !s)}>
            {showWeights ? "Hide matching weights" : "Tune matching weights"}
          </Button>
        </div>
      ) : null}
      {showWeights ? (
        <MatchProfileEditor clientId={clientId} onClose={() => setShowWeights(false)} />
      ) : null}

      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/15 p-6 text-center text-sm text-gray">
          No matches yet.
        </p>
      ) : (
        <Table caption="Matched leads" columns={["Lead", "Status", "Score", ""]}>
          {matches.map((m) => (
            <tr key={m.leadId}>
              <Td className="font-medium">{m.leadName}</Td>
              <Td>{m.leadStatus}</Td>
              <Td className="tabular-nums">{m.score}</Td>
              <Td>
                <Button
                  type="button"
                  size="xs"
                  variant="success"
                  loading={promotingId === m.leadId}
                  onClick={() => handlePromote(m.leadId)}
                >
                  Fill role
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function MatchProfileEditor({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<ClientMatchProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJson<ClientMatchProfileDTO>(`/api/client-match-profiles/${clientId}`).then((res) => {
      if (res.ok) setProfile(res.data);
      setLoading(false);
    });
  }, [clientId]);

  if (loading) return <p className="text-sm text-gray">Loading weights…</p>;
  if (!profile) return null;

  const fields: { key: keyof SaveMatchProfileInput; label: string }[] = [
    { key: "weightSameClient", label: "Same client" },
    { key: "weightSameState", label: "Same state" },
    { key: "weightCredExact", label: "Credential exact" },
    { key: "weightCredPartial", label: "Credential partial" },
    { key: "weightRespondedHot", label: "Hot lead bonus" },
    { key: "weightOutreach", label: "In-outreach bonus" },
    { key: "weightSourced", label: "Sourced bonus" },
    { key: "penaltyCold", label: "Cold penalty" },
    { key: "minScore", label: "Minimum score to surface" },
  ];

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    const weights: SaveMatchProfileInput = {
      weightSameClient: profile.weightSameClient,
      weightSameState: profile.weightSameState,
      weightCredExact: profile.weightCredExact,
      weightCredPartial: profile.weightCredPartial,
      weightRespondedHot: profile.weightRespondedHot,
      weightOutreach: profile.weightOutreach,
      weightSourced: profile.weightSourced,
      penaltyCold: profile.penaltyCold,
      minScore: profile.minScore,
    };
    const res = await putJson(`/api/client-match-profiles/${clientId}`, weights);
    setSaving(false);
    if (res.ok) {
      toast.success("Matching weights saved");
      onClose();
    } else {
      toast.error(res.failure.message || "Could not save weights");
    }
  }

  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
      <p className="mb-3 text-sm font-semibold text-charcoal">
        {profile.isDefault ? "System default weights" : "Custom weights for this client"}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-charcoal">
            {f.label}
            <input
              type="number"
              min={0}
              value={profile[f.key] as number}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, [f.key]: Number(e.target.value) } : p))
              }
              className="rounded-md border border-black/15 px-2 py-1 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button type="button" variant="success" size="sm" loading={saving} onClick={handleSave}>
          Save weights
        </Button>
      </div>
    </div>
  );
}

function NotesPanel({
  role,
  onChanged,
}: {
  role: OpenRoleDetailDTO;
  onChanged: (role: OpenRoleDetailDTO) => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useZodForm(addRoleNoteSchema, { defaultValues: { body: "", category: "General" } });

  function onSubmit(values: AddRoleNoteInput) {
    startTransition(async () => {
      const result = await postJson<{ role: OpenRoleDetailDTO }>(
        `/api/roles/${role.id}/notes`,
        values,
      );
      if (result.ok) {
        onChanged(result.data.role);
        form.reset({ body: "", category: "General" });
      } else {
        toast.error(messageForFailure(result.failure));
      }
    });
  }

  async function handleDelete(noteId: string) {
    const res = await deleteJson<{ role: OpenRoleDetailDTO }>(
      `/api/roles/${role.id}/notes/${noteId}`,
    );
    if (res.ok) {
      onChanged(res.data.role);
    } else {
      toast.error("Could not delete this note");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-2">
        <textarea
          rows={2}
          placeholder="Add a note…"
          className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
          {...form.register("body")}
        />
        <div className="flex items-center gap-2">
          <Select className="w-44" {...form.register("category")}>
            {ROLE_NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" loading={pending} className="ml-auto">
            Add note
          </Button>
        </div>
      </form>

      {role.notes.length === 0 ? (
        <p className="text-sm text-gray">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {role.notes.map((n) => (
            <li key={n.id} className="rounded-md border border-black/10 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-navy">{n.category}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  className="text-xs font-medium text-red hover:underline"
                >
                  Delete
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap text-charcoal">{n.body}</p>
              <p className="mt-1 text-xs text-gray">{n.authorName ?? "Unknown"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
