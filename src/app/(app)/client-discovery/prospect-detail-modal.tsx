"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProspectDetailDTO } from "@/lib/validation/prospect";
import { messageForFailure } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import {
  deleteContact,
  getProspectDetail,
  postAddContact,
  postEnrichApollo,
  postEnrichHunter,
} from "./lib/prospect-fetch";

/**
 * Prospect detail modal — contacts (Apollo/Hunter enrich + manual add/delete) + notes. Fetches
 * the full detail on open (the inventory row only carries the list-item projection); `onUpdated`
 * lets the parent inventory patch its row in place after a mutation, no full-page refetch.
 */
export function ProspectDetailButton({
  prospectId,
  practiceName,
  onUpdated,
}: {
  prospectId: string;
  practiceName: string;
  onUpdated?: (prospect: ProspectDetailDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)}>
        View
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={practiceName}>
        {open ? (
          <ProspectDetailBody
            prospectId={prospectId}
            onUpdated={(p) => {
              onUpdated?.(p);
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

function ProspectDetailBody({
  prospectId,
  onUpdated,
}: {
  prospectId: string;
  onUpdated?: (prospect: ProspectDetailDTO) => void;
}) {
  const [detail, setDetail] = useState<ProspectDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    // AbortController (not just a `cancelled` flag) so StrictMode's dev-only double-invoke of
    // this effect aborts the FIRST fetch instead of just discarding its result — the modal only
    // ever sends one real request per open, matching React's own recommended pattern for this.
    const controller = new AbortController();
    getProspectDetail(prospectId, controller.signal)
      .then((res) => {
        setLoading(false);
        if (res.ok) setDetail(res.data.prospect);
        else toast.error(messageForFailure(res.failure));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        throw err;
      });
    return () => controller.abort();
  }, [prospectId]);

  function apply(prospect: ProspectDetailDTO) {
    setDetail(prospect);
    onUpdated?.(prospect);
  }

  async function enrichApollo() {
    setEnriching(true);
    const res = await postEnrichApollo(prospectId);
    setEnriching(false);
    if (res.ok) {
      apply(res.data.prospect);
      toast.success("Apollo search complete");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function enrichHunter() {
    setEnriching(true);
    const res = await postEnrichHunter(prospectId);
    setEnriching(false);
    if (res.ok) {
      apply(res.data.prospect);
      toast.success("Hunter.io search complete");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function removeContact(contactId: string) {
    const res = await deleteContact(prospectId, contactId);
    if (res.ok) apply(res.data.prospect);
    else toast.error(messageForFailure(res.failure));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Info label="Specialty" value={detail.taxonomy} />
        <Info label="Location" value={[detail.city, detail.state].filter(Boolean).join(", ")} />
        <Info label="Phone" value={detail.phone} />
        <Info label="Website" value={detail.website} />
      </div>

      {detail.notes ? (
        <p className="rounded-md bg-black/[0.03] p-3 text-sm text-charcoal whitespace-pre-wrap">
          {detail.notes}
        </p>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-wide text-navy uppercase">Contacts</h3>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              loading={enriching}
              onClick={enrichApollo}
            >
              Find via Apollo
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              loading={enriching}
              onClick={enrichHunter}
            >
              Find via Hunter.io
            </Button>
          </div>
        </div>
        {detail.contacts.length === 0 ? (
          <p className="text-sm text-gray italic">No contacts yet — try enrichment above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5">
            {detail.contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-charcoal">
                    {c.fullName} {c.title ? `· ${c.title}` : ""}
                  </p>
                  <p className="text-xs text-gray">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"} ·{" "}
                    {c.source}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeContact(c.id)}
                  className="text-xs text-red hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddContactForm prospectId={prospectId} onAdded={apply} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-gray uppercase">{label}</p>
      <p className="text-charcoal">{value || "—"}</p>
    </div>
  );
}

function AddContactForm({
  prospectId,
  onAdded,
}: {
  prospectId: string;
  onAdded: (prospect: ProspectDetailDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!fullName.trim()) return;
    setPending(true);
    const res = await postAddContact(prospectId, {
      fullName: fullName.trim(),
      title: title.trim() || null,
      email: email.trim() || null,
    });
    setPending(false);
    if (res.ok) {
      onAdded(res.data.prospect);
      setFullName("");
      setTitle("");
      setEmail("");
      setOpen(false);
      toast.success("Contact added");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  if (!open) {
    return (
      <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(true)}>
        + Add contact manually
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md bg-black/[0.02] p-3">
      <input
        aria-label="Full name"
        placeholder="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
      />
      <input
        aria-label="Title"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
      />
      <input
        aria-label="Email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
      />
      <Button type="button" size="xs" loading={pending} onClick={() => void submit()}>
        Add
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
