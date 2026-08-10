"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SavedIcpDTO } from "@/lib/validation/saved-icp";
import type { SearchProspectsQuery } from "@/lib/validation/prospect";
import { messageForFailure } from "@/lib/api/client";
import { postJson, deleteJson, type ApiResult } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

/**
 * "Saved ICPs" row — mirrors `(app)/lib/saved-views-bar.tsx`'s UX exactly (a "+ Save" trigger +
 * one chip per saved search, click to re-apply, × to delete), except an ICP stores STRUCTURED
 * filter fields (taxonomy/state/city/zip), not a raw query string — see `SavedIcp`'s doc comment
 * in `prisma/schema.prisma` for why. Team-shared by default (every non-private ICP is visible to
 * everyone — `savedIcpService.list` already filtered this server-side); only the owner can delete.
 */
export function SavedIcpBar({
  savedIcps,
  currentFilters,
}: {
  savedIcps: SavedIcpDTO[];
  currentFilters: SearchProspectsQuery | null;
}) {
  const router = useRouter();
  const [icps, setIcps] = useState(savedIcps);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setIcps(savedIcps), [savedIcps]);

  function applyIcp(icp: SavedIcpDTO) {
    const params = new URLSearchParams();
    if (icp.taxonomy) params.set("taxonomy", icp.taxonomy);
    if (icp.state) params.set("state", icp.state);
    if (icp.city) params.set("city", icp.city);
    if (icp.zip) params.set("zip", icp.zip);
    router.push(`/client-discovery/search?${params.toString()}`);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !currentFilters) return;
    setSaving(true);
    const result: ApiResult<{ savedIcp: SavedIcpDTO }> = await postJson("/api/saved-icps", {
      name: trimmed,
      taxonomy: currentFilters.taxonomy ?? null,
      state: currentFilters.state ?? null,
      city: currentFilters.city ?? null,
      zip: currentFilters.zip ?? null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    setOpen(false);
    setName("");
    toast.success(`Saved "${trimmed}"`);
    router.refresh();
  }

  async function handleDelete(icp: SavedIcpDTO) {
    if (!window.confirm(`Delete the "${icp.name}" ICP? This cannot be undone.`)) return;
    const result = await deleteJson(`/api/saved-icps/${icp.id}`);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    setIcps((prev) => prev.filter((i) => i.id !== icp.id));
    toast.success(`Deleted "${icp.name}"`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {icps.length > 0 ? (
        <span className="text-xs font-semibold tracking-wide text-gray uppercase">Saved ICPs</span>
      ) : null}
      {icps.map((icp) => (
        <span
          key={icp.id}
          className="inline-flex items-center gap-1 rounded-full border border-black/15 py-1 pr-1 pl-3 text-sm"
        >
          <button
            type="button"
            onClick={() => applyIcp(icp)}
            className="hover:underline"
            title={`Search ${[icp.taxonomy, icp.state, icp.city].filter(Boolean).join(" · ")}`}
          >
            {icp.isPrivate ? "🔒 " : ""}
            {icp.name}
          </button>
          <button
            type="button"
            aria-label={`Delete ${icp.name}`}
            onClick={() => handleDelete(icp)}
            className="rounded-full px-1 text-gray hover:bg-black/5 hover:text-charcoal"
          >
            ×
          </button>
        </span>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="!rounded-full border border-dashed border-black/20"
        disabled={!currentFilters}
        onClick={() => setOpen(true)}
        title={
          currentFilters ? "Save this search as a reusable ICP" : "Run a search first to save it"
        }
      >
        + Save as ICP
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Save this search as an ICP">
        {open ? (
          <div className="flex flex-col gap-3 p-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ICP name"
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                loading={saving}
                disabled={!name.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
