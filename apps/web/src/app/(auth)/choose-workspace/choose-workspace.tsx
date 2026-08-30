"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TenantChoiceDTO } from "@destaworks/contracts/validation/tenant";
import { acceptInvitation, messageForFailure, switchTenant } from "../../(app)/lib/tenant-fetch";
import { AuthShell } from "../auth-shell";

/** The picker itself. An `invited` workspace is accepted first; an `active` one is entered. */
export function ChooseWorkspace({ tenants, name }: { tenants: TenantChoiceDTO[]; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function enter(tenant: TenantChoiceDTO) {
    setBusy(true);
    const result =
      tenant.status === "invited"
        ? await acceptInvitation(tenant.slug)
        : await switchTenant(tenant.slug);
    setBusy(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <AuthShell activeTab={null}>
      <header>
        <h1 className="font-serif text-xl text-ivory">Choose a workspace</h1>
        <p className="mt-1 text-[13px] text-ivory/50">
          {name}, you belong to more than one. Pick the one you want to work in — you can switch any
          time from the header.
        </p>
      </header>

      {tenants.length === 0 ? (
        <p className="mt-5 text-[13px] text-ivory/50">
          You are signed in but not a member of any workspace. Ask an Owner to invite you.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {tenants.map((t) => (
            <li key={t.tenantId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void enter(t)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08] disabled:opacity-60"
              >
                <span>
                  <span className="block text-[15px] font-semibold text-ivory">{t.name}</span>
                  <span className="block text-xs text-ivory/40">{t.role}</span>
                </span>
                <span className="text-[13px] font-semibold text-brand">
                  {t.status === "invited" ? "Accept" : "Enter"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AuthShell>
  );
}
