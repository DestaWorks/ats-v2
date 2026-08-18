"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  setAiDisabledSchema,
  type AiSettingsDTO,
  type AiUsageOverviewDTO,
} from "@/lib/validation/ai-ops";
import { messageForFailure, patchJson } from "@/lib/api/client";
import { useApiForm } from "@/lib/forms/use-api-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fieldError } from "../candidates/[id]/lib/form-error";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <span className="text-[10px] font-semibold tracking-wide text-gray uppercase">{label}</span>
      <span className="font-serif text-xl font-bold text-navy">{value}</span>
    </Card>
  );
}

export function AiOpsTab({
  initialSettings,
  usage,
}: {
  initialSettings: AiSettingsDTO;
  usage: AiUsageOverviewDTO;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [pending, setPending] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function enable() {
    if (!window.confirm("Re-enable AI features for everyone?")) return;
    setPending(true);
    const res = await patchJson<AiSettingsDTO>("/api/admin/ai/settings", { disabled: false });
    setPending(false);
    if (res.ok) {
      setSettings(res.data);
      toast.success("AI features re-enabled");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Badge tone={settings.disabled ? "danger" : "success"} size="sm">
            {settings.disabled ? "Disabled" : "Enabled"}
          </Badge>
          <p className="text-sm text-charcoal">
            {settings.disabled
              ? `AI features are off for everyone.${settings.disabledReason ? ` Reason: ${settings.disabledReason}` : ""}`
              : "AI features are on, subject to the configured provider key."}
          </p>
        </div>
        <Button
          type="button"
          variant={settings.disabled ? "success" : "danger"}
          size="sm"
          loading={pending}
          onClick={() => (settings.disabled ? void enable() : setDisabling(true))}
        >
          {settings.disabled ? "Re-enable AI" : "Disable AI"}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={`Calls (${usage.windowHours}h)`} value={String(usage.totalCalls)} />
        <StatTile label="Success / Error" value={`${usage.successCount} / ${usage.errorCount}`} />
        <StatTile
          label="Tokens (in/out)"
          value={`${usage.totalInputTokens.toLocaleString()} / ${usage.totalOutputTokens.toLocaleString()}`}
        />
        <StatTile label="Avg latency" value={`${usage.avgLatencyMs.toLocaleString()} ms`} />
      </div>

      {usage.recent.length === 0 ? (
        <EmptyState
          title="No AI calls yet"
          description="Recent resume/JD/inbound extractions and briefs will show up here."
        />
      ) : (
        <Table
          caption="Recent AI calls"
          columns={["Operation", "Provider / Model", "Status", "Tokens", "Latency", "When"]}
        >
          {usage.recent.map((e) => (
            <tr key={e.id}>
              <Td>{e.operation}</Td>
              <Td>
                {e.provider} / {e.model}
              </Td>
              <Td>
                <Badge tone={e.status === "success" ? "success" : "danger"} size="sm">
                  {e.status}
                </Badge>
                {e.errorName ? (
                  <span className="ml-1.5 text-xs text-gray">{e.errorName}</span>
                ) : null}
              </Td>
              <Td>
                {e.inputTokens ?? "—"} / {e.outputTokens ?? "—"}
              </Td>
              <Td>{e.latencyMs.toLocaleString()} ms</Td>
              <Td>{new Date(e.createdAt).toLocaleString()}</Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={disabling} onClose={() => setDisabling(false)} title="Disable AI">
        <DisableAiForm
          onSaved={(next) => {
            setSettings(next);
            setDisabling(false);
          }}
          onCancel={() => setDisabling(false)}
        />
      </Modal>
    </div>
  );
}

function DisableAiForm({
  onSaved,
  onCancel,
}: {
  onSaved: (settings: AiSettingsDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(setAiDisabledSchema, {
    defaultValues: { disabled: true, reason: "" },
    submit: (values) => patchJson<AiSettingsDTO>("/api/admin/ai/settings", values),
    onSuccess: (data) => {
      toast.success("AI features disabled");
      onSaved(data);
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <p className="text-sm text-gray">
        Every AI-gated call (resume/JD/inbound extraction, briefs) returns 503 until this is turned
        back on.
      </p>
      <Field label="Reason (optional)" htmlFor="dai-reason" error={fieldError(form, "reason")}>
        <Textarea id="dai-reason" rows={3} {...form.register("reason")} />
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={pending}>
          Disable AI
        </Button>
      </div>
    </form>
  );
}
