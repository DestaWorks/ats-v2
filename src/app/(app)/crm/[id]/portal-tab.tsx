"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AdminPortalContactDTO, GeneratedPortalLinkDTO } from "@/lib/validation/portal";
import { getJson, messageForFailure, postJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";

// --- Portal access tab (Wave 4.3) -------------------------------------------

/** Shown once after generating a link — the plaintext token is never re-fetchable. */
function GeneratedPortalLinkBanner({
  fullName,
  token,
  onDismiss,
}: {
  fullName: string;
  token: string;
  onDismiss: () => void;
}) {
  const link =
    typeof window !== "undefined" ? `${window.location.origin}/portal/access?token=${token}` : "";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber bg-amber/10 p-3">
      <p className="text-sm text-charcoal">
        Portal link for <span className="font-semibold">{fullName}</span>:{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs break-all">{link}</code> —
        send it now, it won&apos;t be shown again.
      </p>
      <Button type="button" variant="secondary" size="xs" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

export function PortalAccessTab({ clientId }: { clientId: string }) {
  const [contacts, setContacts] = useState<AdminPortalContactDTO[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ fullName: string; token: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getJson<{ contacts: AdminPortalContactDTO[] }>(
      `/api/crm/clients/${clientId}/portal/contacts`,
    ).then((res) => {
      if (!cancelled && res.ok) setContacts(res.data.contacts);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function upsertContact(contact: AdminPortalContactDTO) {
    setContacts((prev) => (prev ?? []).map((c) => (c.id === contact.id ? contact : c)));
  }

  async function handleGenerate(contact: AdminPortalContactDTO) {
    setBusyId(contact.id);
    const res = await postJson<GeneratedPortalLinkDTO>(
      `/api/crm/clients/${clientId}/portal/contacts/${contact.id}/tokens`,
      {},
    );
    setBusyId(null);
    if (res.ok) {
      toast.success(`Portal link generated for ${contact.fullName}`);
      upsertContact(res.data.contact);
      setGenerated({ fullName: contact.fullName, token: res.data.token });
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function handleRevoke(contact: AdminPortalContactDTO) {
    if (!contact.activeToken) return;
    if (
      !window.confirm(`Revoke ${contact.fullName}'s portal link? It stops working immediately.`)
    ) {
      return;
    }
    setBusyId(contact.id);
    const res = await postJson<{ ok: true }>(
      `/api/crm/clients/${clientId}/portal/tokens/${contact.activeToken.id}/revoke`,
      {},
    );
    setBusyId(null);
    if (res.ok) {
      toast.success("Portal link revoked");
      upsertContact({ ...contact, activeToken: null });
    } else {
      toast.error("Could not revoke this link");
    }
  }

  if (contacts === null) {
    return <p className="text-sm text-gray">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {generated ? (
        <GeneratedPortalLinkBanner
          fullName={generated.fullName}
          token={generated.token}
          onDismiss={() => setGenerated(null)}
        />
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Add a contact on the Contacts tab first, then generate them a portal link here."
        />
      ) : (
        <Table caption="Portal access" columns={["Contact", "Email", "Status", "Actions"]}>
          {contacts.map((c) => (
            <tr key={c.id}>
              <Td className="font-medium text-charcoal">{c.fullName}</Td>
              <Td>{c.email ?? "—"}</Td>
              <Td>
                {c.activeToken ? (
                  <Badge tone="success" size="sm">
                    Active
                  </Badge>
                ) : (
                  <Badge tone="neutral" size="sm">
                    No link
                  </Badge>
                )}
              </Td>
              <Td>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    loading={busyId === c.id}
                    onClick={() => void handleGenerate(c)}
                  >
                    {c.activeToken ? "Regenerate" : "Generate link"}
                  </Button>
                  {c.activeToken ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="xs"
                      loading={busyId === c.id}
                      onClick={() => void handleRevoke(c)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
