"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { taxonomyForCredential } from "@/lib/constants";
import type { SimilarProviderDTO } from "@/lib/validation/similarity";
import { messageForFailure } from "@/lib/api/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, type ButtonSize } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, Td } from "@/components/ui/table";
import { postDiscoverAdd } from "../discover/lib/discover-fetch";
import { postFindSimilar } from "./lib/similarity-fetch";

export interface ClientOption {
  id: string;
  name: string;
}

/** Tone for the similarity score badge — matches `scoreStateSimilarity`'s 100/60/30 tiers. */
function scoreTone(score: number): BadgeTone {
  if (score >= 100) return "success";
  if (score >= 60) return "amber";
  return "neutral";
}

/**
 * "Find similar" trigger + results modal (Wave 3.2, Smarter Sourcing) — one shared component for
 * all three entry points (candidate detail, Discover results, Sourcing lead rows), each just
 * passing its own anchor `{credential, state}`. Disabled (with an explanatory tooltip, computed
 * client-side via the same `taxonomyForCredential` lookup the server uses) when the anchor's
 * credential has no verified NPPES taxonomy mapping — never opens the modal to a request that
 * would just fail. Search fires on open, not preloaded, so a page view never burns an NPPES call.
 */
export function FindSimilarButton({
  credential,
  state,
  anchorLabel,
  clients,
  size = "sm",
}: {
  credential: string | null;
  state: string | null;
  anchorLabel: string;
  clients: ClientOption[];
  /** Matches the surrounding row's button size — Discover/candidate-detail use "sm", the dense
   *  Sourcing lead row uses "xs" alongside its other compact actions. */
  size?: ButtonSize;
}) {
  const [open, setOpen] = useState(false);
  const mapped = Boolean(taxonomyForCredential(credential));

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={size}
        disabled={!mapped}
        title={mapped ? undefined : "No similarity search available for this credential yet"}
        onClick={() => setOpen(true)}
      >
        Find similar
      </Button>
      {open ? (
        <SimilarProvidersModal
          credential={credential}
          state={state}
          anchorLabel={anchorLabel}
          clients={clients}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function SimilarProvidersModal({
  credential,
  state,
  anchorLabel,
  clients,
  onClose,
}: {
  credential: string | null;
  state: string | null;
  anchorLabel: string;
  clients: ClientOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<SimilarProviderDTO[]>([]);
  const [taxonomyLabel, setTaxonomyLabel] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [clientId, setClientId] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await postFindSimilar(credential, state);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        toast.error(messageForFailure(result.failure));
        return;
      }
      setResults(result.data.results);
      setTaxonomyLabel(result.data.taxonomyLabel);
    })();
    return () => {
      cancelled = true;
    };
  }, [credential, state]);

  const selectable = results.filter((r) => !added.has(r.npi));

  function toggle(npi: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(npi)) next.delete(npi);
      else next.add(npi);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable.map((r) => r.npi)),
    );
  }

  async function addSelected() {
    const rows = results
      .filter((r) => selected.has(r.npi))
      .map((r) => ({
        npi: r.npi,
        name: r.name,
        credential: r.credential,
        state: r.state,
        city: r.city,
        phone: r.phone,
        taxonomyDesc: r.taxonomyDesc,
        licenseNumber: r.licenseNumber,
      }));
    setPending(true);
    const result = await postDiscoverAdd(rows, clientId || null);
    setPending(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    const { added: addedCount, skipped } = result.data;
    toast.success(
      `Added ${addedCount} to Sourcing${skipped > 0 ? ` (${skipped} skipped — already sourced)` : ""}`,
    );
    setAdded((prev) => new Set([...prev, ...rows.map((r) => r.npi)]));
    setSelected(new Set());
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={`Similar to ${anchorLabel}`}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner label="Searching NPPES" />
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          title="No new providers found"
          description="No net-new NPPES providers matched this profession — everyone found is already in Sourcing or the pipeline."
        />
      ) : (
        <>
          {taxonomyLabel ? (
            <p className="mb-3 text-xs text-gray">Searched: {taxonomyLabel} · nationwide</p>
          ) : null}
          <Table
            caption="Similar providers found on NPPES"
            columns={[
              <input
                key="select-all"
                type="checkbox"
                aria-label="Select all results"
                checked={selectable.length > 0 && selected.size === selectable.length}
                onChange={toggleAll}
                disabled={selectable.length === 0}
              />,
              "Name",
              "Credential",
              "Location",
              "Similarity",
              "",
            ]}
            toolbar={
              selected.size > 0 ? (
                <>
                  <span className="text-xs font-semibold text-charcoal">
                    {selected.size} selected
                  </span>
                  <Select
                    aria-label="Target client"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    style={{ width: "11rem" }}
                  >
                    <option value="">Unassigned</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    loading={pending}
                    onClick={addSelected}
                  >
                    Add {selected.size} to Sourcing
                  </Button>
                </>
              ) : null
            }
          >
            {results.map((row) => {
              const isAdded = added.has(row.npi);
              return (
                <tr key={row.npi}>
                  <Td>
                    {!isAdded ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selected.has(row.npi)}
                        onChange={() => toggle(row.npi)}
                      />
                    ) : null}
                  </Td>
                  <Td className="font-medium">{row.name}</Td>
                  <Td>{row.credential ?? "—"}</Td>
                  <Td>{[row.city, row.state].filter(Boolean).join(", ") || "—"}</Td>
                  <Td>
                    <Badge tone={scoreTone(row.similarityScore)}>{row.similarityScore}</Badge>
                  </Td>
                  <Td>{isAdded ? <Badge tone="success">Added</Badge> : null}</Td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </Modal>
  );
}
