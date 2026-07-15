"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { SavedViewDTO } from "@/lib/validation/saved-view";
import type { SavedViewScope } from "@/lib/constants";
import { messageForFailure } from "@/lib/api/client";
import { createSavedView, deleteSavedView } from "./saved-view-fetch";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

/**
 * "Views" row (Wave 2.1 closeout, legacy `pSavedViews` "VIEWS:" chip row parity, now DB-backed
 * instead of `localStorage`) — a "+ Save view" trigger that captures the CURRENT `searchParams`
 * as a named, reloadable view, plus a chip per saved view (click to apply, × to delete). Always
 * visible (not tucked inside `FiltersPopover` — legacy's row was always-visible too), rendered as
 * its own row alongside the page's filter toolbar. Deliberately in the shared `(app)/lib/` so the
 * candidates-list follow-up can reuse it — only `scope` changes per page.
 */
export function SavedViewsBar({
  scope,
  initial,
}: {
  scope: SavedViewScope;
  initial: SavedViewDTO[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-sync with the RSC's fresh props after router.refresh() (create/delete).
  useEffect(() => setViews(initial), [initial]);

  function applyView(view: SavedViewDTO) {
    router.replace(view.query ? `${pathname}?${view.query}` : pathname, { scroll: false });
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const result = await createSavedView({ scope, name: trimmed, query: searchParams.toString() });
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

  async function handleDelete(view: SavedViewDTO) {
    if (!window.confirm(`Delete the "${view.name}" view? This cannot be undone.`)) return;
    const result = await deleteSavedView(view.id);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return;
    }
    setViews((prev) => prev.filter((v) => v.id !== view.id));
    toast.success(`Deleted "${view.name}"`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.length > 0 ? (
        <span className="text-xs font-semibold tracking-wide text-gray uppercase">Views</span>
      ) : null}
      {views.map((v) => (
        <span
          key={v.id}
          className="inline-flex items-center gap-1 rounded-full border border-black/15 py-1 pr-1 pl-3 text-sm"
        >
          <button type="button" onClick={() => applyView(v)} className="hover:underline">
            {v.name}
          </button>
          <button
            type="button"
            aria-label={`Delete ${v.name}`}
            onClick={() => handleDelete(v)}
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
        className="rounded-full border border-dashed border-black/20"
        onClick={() => setOpen(true)}
      >
        + Save view
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Save this view">
        {open ? (
          <div className="flex flex-col gap-3 p-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="View name"
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} loading={saving} disabled={!name.trim()}>
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
