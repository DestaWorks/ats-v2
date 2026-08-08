"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CLOSED_DEAL_STAGES, OPEN_DEAL_STAGES } from "@/lib/constants";
import { createDealSchema, type DealDTO } from "@/lib/validation/client";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { postJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { fieldError } from "../../candidates/[id]/lib/form-error";
import { DealDetailModal } from "./deal-detail-modal";

// --- Deals tab (Wave 4.2 slice 3) — kanban ----------------------------------

export function formatMoney(n: number | null): string {
  return n == null ? "—" : `$${n.toLocaleString()}`;
}

export function DealsTab({
  clientId,
  deals,
  onChanged,
}: {
  clientId: string;
  deals: DealDTO[];
  onChanged: (next: DealDTO[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<DealDTO | null>(null);
  const closed = deals.filter((d) =>
    CLOSED_DEAL_STAGES.includes(d.stage as (typeof CLOSED_DEAL_STAGES)[number]),
  );

  function upsertDeal(deal: DealDTO) {
    const exists = deals.some((d) => d.id === deal.id);
    onChanged(exists ? deals.map((d) => (d.id === deal.id ? deal : d)) : [...deals, deal]);
  }

  function removeDealLocal(dealId: string) {
    onChanged(deals.filter((d) => d.id !== dealId));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray">
          {deals.length - closed.length} open deal{deals.length - closed.length === 1 ? "" : "s"}
          {closed.length > 0 ? ` · ${closed.length} closed` : ""}
        </p>
        <Button type="button" variant="success" size="sm" onClick={() => setAddOpen(true)}>
          + Add Deal
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {OPEN_DEAL_STAGES.map((stage) => (
          <div key={stage} className="flex flex-col gap-2 rounded-lg bg-black/[0.02] p-2">
            <div className="px-1 text-xs font-bold tracking-wide text-gray uppercase">
              {stage} ({deals.filter((d) => d.stage === stage).length})
            </div>
            {deals
              .filter((d) => d.stage === stage)
              .map((d) => (
                <DealCard key={d.id} deal={d} onClick={() => setSelected(d)} />
              ))}
          </div>
        ))}
      </div>

      {closed.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold text-charcoal">Closed Deals</h3>
          <ul className="flex flex-col gap-2">
            {closed.map((d) => (
              <li
                key={d.id}
                onClick={() => setSelected(d)}
                className="cursor-pointer rounded-lg border border-black/5 bg-white p-3 hover:bg-black/[0.02]"
              >
                <div className="flex items-center gap-2">
                  <Badge tone={d.stage === "Signed" ? "success" : "danger"} size="sm">
                    {d.stage === "Signed" ? "Won" : "Lost"}
                  </Badge>
                  <span className="text-sm font-semibold text-charcoal">{d.name}</span>
                  <span className="text-xs text-gray">{formatMoney(d.estValue)}</span>
                </div>
                {d.closeReason ? (
                  <p className="mt-1 text-xs text-gray">Reason: {d.closeReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add deal">
        {addOpen ? (
          <AddDealForm
            clientId={clientId}
            onSaved={(d) => {
              upsertDeal(d);
              setAddOpen(false);
            }}
            onCancel={() => setAddOpen(false)}
          />
        ) : null}
      </Modal>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Deal"}
      >
        {selected ? (
          <DealDetailModal
            clientId={clientId}
            deal={selected}
            onChanged={(d) => {
              upsertDeal(d);
              setSelected(d);
            }}
            onDeleted={() => {
              removeDealLocal(selected.id);
              setSelected(null);
            }}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function DealCard({ deal, onClick }: { deal: DealDTO; onClick: () => void }) {
  const openBlockers = deal.blockers.filter((b) => !b.resolved).length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white p-2.5 text-left shadow-sm hover:border-navy/30"
    >
      <span className="text-sm font-semibold text-charcoal">{deal.name}</span>
      <span className="text-xs text-gray">{formatMoney(deal.estValue)}</span>
      <div className="flex items-center gap-1.5">
        {deal.probabilityOverride != null ? (
          <Badge tone="navy" size="sm">
            {deal.probabilityOverride}%
          </Badge>
        ) : null}
        {openBlockers > 0 ? (
          <Badge tone="danger" size="sm">
            {openBlockers} blocker{openBlockers === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

function AddDealForm({
  clientId,
  onSaved,
  onCancel,
}: {
  clientId: string;
  onSaved: (deal: DealDTO) => void;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(createDealSchema, {
    defaultValues: { name: "" },
    submit: (values) => postJson<{ deal: DealDTO }>(`/api/crm/clients/${clientId}/deals`, values),
    onSuccess: (data) => {
      toast.success("Deal added");
      onSaved(data.deal);
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <Field label="Name" htmlFor="cd-name" error={fieldError(form, "name")} required>
        <Input id="cd-name" autoFocus {...form.register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Est. value ($)" htmlFor="cd-value" error={fieldError(form, "estValue")}>
          <Input
            id="cd-value"
            type="number"
            {...form.register("estValue", {
              setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
            })}
          />
        </Field>
        <Field
          label="Expected close"
          htmlFor="cd-close-date"
          error={fieldError(form, "expectedCloseDate")}
        >
          <Input
            id="cd-close-date"
            type="date"
            {...form.register("expectedCloseDate", { setValueAs: emptyToNull })}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Deal
        </Button>
      </div>
    </form>
  );
}
