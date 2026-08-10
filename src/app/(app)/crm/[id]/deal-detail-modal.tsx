"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CLOSED_DEAL_STAGES, DEAL_STAGES } from "@/lib/constants";
import {
  updateDealSchema,
  type AddBlockerInput,
  type DealBlockerDTO,
  type DealDTO,
  type UpdateDealInput,
} from "@/lib/validation/client";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { deleteJson, messageForFailure, patchJson, postJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldError } from "../../candidates/[id]/lib/form-error";

// --- Deal detail modal (Wave 4.2 slice 3) — form + stage move + blockers ----

export function DealDetailModal({
  clientId,
  deal,
  onChanged,
  onDeleted,
  onClose,
}: {
  clientId: string;
  deal: DealDTO;
  onChanged: (deal: DealDTO) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState(deal.closeReason ?? "");
  const [postMortem, setPostMortem] = useState(deal.postMortem ?? "");
  const [blockerText, setBlockerText] = useState("");
  const [blockerPending, setBlockerPending] = useState(false);
  const isClosed = CLOSED_DEAL_STAGES.includes(deal.stage as (typeof CLOSED_DEAL_STAGES)[number]);

  const form = useZodForm(updateDealSchema, {
    defaultValues: {
      name: deal.name,
      estValue: deal.estValue,
      probabilityOverride: deal.probabilityOverride,
    },
  });

  async function patchDeal(values: UpdateDealInput) {
    const res = await patchJson<{ deal: DealDTO }>(
      `/api/crm/clients/${clientId}/deals/${deal.id}`,
      values,
    );
    if (res.ok) onChanged(res.data.deal);
    else toast.error(messageForFailure(res.failure));
    return res;
  }

  function onSubmit(values: UpdateDealInput) {
    startTransition(async () => {
      const res = await patchDeal(values);
      if (res.ok) toast.success("Deal updated");
    });
  }

  function moveStage(stage: string) {
    if ((CLOSED_DEAL_STAGES as readonly string[]).includes(stage)) {
      setClosing(true);
      return;
    }
    startTransition(async () => {
      await patchDeal({ stage: stage as UpdateDealInput["stage"] });
    });
  }

  function confirmClose(stage: "Signed" | "Lost") {
    startTransition(async () => {
      const res = await patchDeal({
        stage,
        closeReason: closeReason || null,
        postMortem: postMortem || null,
      });
      if (res.ok) {
        toast.success(stage === "Signed" ? "Deal marked won" : "Deal marked lost");
        setClosing(false);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${deal.name}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const res = await deleteJson(`/api/crm/clients/${clientId}/deals/${deal.id}`);
      if (res.ok) {
        toast.success("Deal deleted");
        onDeleted();
      } else {
        toast.error("Could not delete this deal");
      }
    });
  }

  async function handleAddBlocker() {
    if (!blockerText.trim() || blockerPending) return;
    setBlockerPending(true);
    const res = await postJson<{ blocker: DealBlockerDTO }>(
      `/api/crm/clients/${clientId}/deals/${deal.id}/blockers`,
      { text: blockerText.trim() } satisfies AddBlockerInput,
    );
    setBlockerPending(false);
    if (res.ok) {
      onChanged({ ...deal, blockers: [...deal.blockers, res.data.blocker] });
      setBlockerText("");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleToggleBlocker(blocker: DealBlockerDTO) {
    const res = await patchJson<{ blocker: DealBlockerDTO }>(
      `/api/crm/clients/${clientId}/deals/${deal.id}/blockers/${blocker.id}`,
      { resolved: !blocker.resolved },
    );
    if (res.ok) {
      onChanged({
        ...deal,
        blockers: deal.blockers.map((b) => (b.id === blocker.id ? res.data.blocker : b)),
      });
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleDeleteBlocker(blocker: DealBlockerDTO) {
    const res = await deleteJson(
      `/api/crm/clients/${clientId}/deals/${deal.id}/blockers/${blocker.id}`,
    );
    if (res.ok) {
      onChanged({ ...deal, blockers: deal.blockers.filter((b) => b.id !== blocker.id) });
    } else {
      toast.error("Could not delete this blocker");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        method="post"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-4"
      >
        <Field label="Name" htmlFor="dd-name" error={fieldError(form, "name")} required>
          <Input id="dd-name" {...form.register("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Est. value ($)" htmlFor="dd-value" error={fieldError(form, "estValue")}>
            <Input
              id="dd-value"
              type="number"
              {...form.register("estValue", {
                setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
              })}
            />
          </Field>
          <Field
            label="Probability override (%)"
            htmlFor="dd-prob"
            error={fieldError(form, "probabilityOverride")}
          >
            <Input
              id="dd-prob"
              type="number"
              min={0}
              max={100}
              {...form.register("probabilityOverride", {
                setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
              })}
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" size="sm" loading={pending}>
            Save
          </Button>
        </div>
      </form>

      <div>
        <div className="mb-1 text-[11px] text-gray uppercase">Stage</div>
        <Select value={deal.stage} onChange={(e) => moveStage(e.target.value)} disabled={pending}>
          {DEAL_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {closing ? (
        <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-black/[0.02] p-3">
          <p className="text-sm font-semibold text-charcoal">Close this deal</p>
          <Field label="Reason" htmlFor="dd-close-reason">
            <Input
              id="dd-close-reason"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
            />
          </Field>
          <Field label="Post-mortem" htmlFor="dd-postmortem">
            <textarea
              id="dd-postmortem"
              rows={3}
              className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
              value={postMortem}
              onChange={(e) => setPostMortem(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setClosing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              size="sm"
              loading={pending}
              onClick={() => confirmClose("Signed")}
            >
              Mark Won
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={pending}
              onClick={() => confirmClose("Lost")}
            >
              Mark Lost
            </Button>
          </div>
        </div>
      ) : null}

      {isClosed && (deal.closeReason || deal.postMortem) ? (
        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 text-sm">
          {deal.closeReason ? (
            <p>
              <span className="font-semibold">Reason:</span> {deal.closeReason}
            </p>
          ) : null}
          {deal.postMortem ? (
            <p className="mt-1">
              <span className="font-semibold">Post-mortem:</span> {deal.postMortem}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-[11px] text-gray uppercase">Blockers</div>
        <div className="flex flex-col gap-2">
          {deal.blockers.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                onClick={() => void handleToggleBlocker(b)}
                className={`flex-1 text-left ${b.resolved ? "text-gray line-through" : "text-charcoal"}`}
              >
                {b.resolved ? "✅" : "⬜"} {b.text}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteBlocker(b)}
                className="text-xs text-red hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {deal.blockers.length === 0 ? <p className="text-xs text-gray">No blockers.</p> : null}
          <div className="flex gap-2">
            <Input
              value={blockerText}
              disabled={blockerPending}
              onChange={(e) => setBlockerText(e.target.value)}
              placeholder="Add a blocker…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddBlocker();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={blockerPending}
              onClick={() => void handleAddBlocker()}
            >
              {blockerPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/5 pt-4">
        <Button type="button" variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
          Delete Deal
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
