"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TenantChoiceDTO } from "@destaworks/contracts/validation/tenant";
import { acceptInvitation, messageForFailure, switchTenant } from "./lib/tenant-fetch";

/**
 * Switch the active workspace, and accept an invitation to a new one.
 *
 * Renders nothing for someone with a single active membership and no invitations — the common
 * case, and a chrome element that only ever shows one option is noise.
 *
 * An `invited` membership is deliberately NOT switchable: it grants nothing until accepted, so it
 * is shown as an invitation with its own action rather than as a workspace you can enter. The
 * server enforces that regardless; this only stops the UI offering a door that will not open.
 */
export function WorkspaceSwitcher({
  tenants,
  activeTenantId,
}: {
  tenants: TenantChoiceDTO[];
  activeTenantId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = tenants.find((t) => t.tenantId === activeTenantId);
  const others = tenants.filter((t) => t.tenantId !== activeTenantId && t.status === "active");
  const invitations = tenants.filter((t) => t.status === "invited");

  if (others.length === 0 && invitations.length === 0) return null;

  async function run(action: () => ReturnType<typeof switchTenant>, name: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    setOpen(false);
    toast.success(`Now working in ${name}`);
    // The cookie the server just set decides the tenant for every later request, so the whole
    // tree has to re-render against it — not just this component's state.
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-black/10 px-2.5 py-1.5 text-sm font-semibold text-navy hover:bg-black/[0.03] disabled:opacity-60"
      >
        {active?.name ?? "Workspace"}
        {invitations.length > 0 ? (
          <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
            {invitations.length}
          </span>
        ) : null}
        <span aria-hidden="true" className="text-black/40">
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-black/10 bg-white py-1 shadow-lg"
        >
          {others.length > 0 ? (
            <p className="px-3 py-1 text-[11px] font-semibold tracking-wide text-gray uppercase">
              Switch to
            </p>
          ) : null}
          {others.map((t) => (
            <button
              key={t.tenantId}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void run(() => switchTenant(t.slug), t.name)}
              className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03] disabled:opacity-60"
            >
              <span className="font-medium text-navy">{t.name}</span>
              <span className="text-xs text-gray">{t.role}</span>
            </button>
          ))}

          {invitations.length > 0 ? (
            <p className="mt-1 border-t border-black/10 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-gray uppercase">
              Invitations
            </p>
          ) : null}
          {invitations.map((t) => (
            <button
              key={t.tenantId}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void run(() => acceptInvitation(t.slug), t.name)}
              className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03] disabled:opacity-60"
            >
              <span className="font-medium text-navy">{t.name}</span>
              <span className="text-xs font-semibold text-brand">Accept</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
