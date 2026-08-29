"use client";

import { useEffect, useRef, useState } from "react";
import { getJson, patchJson } from "@/lib/api/client";
import type { UserPreferencesDTO } from "@destaworks/contracts/validation/user-preferences";

/**
 * Global per-user scratchpad (Wave 4.1, legacy `index.html:594-597,8696-8712`) — a floating FAB,
 * mounted once at the app-shell root so it's available from every view (matches legacy). Legacy
 * stored this in `localStorage` under a key with NO real user scoping (`"desta_sticky_"+user`,
 * `user` being a display-name string, not an auth id — fragile and doesn't sync across devices);
 * this version persists to `User.stickyNote` via the real authenticated user id.
 */
export function StickyNote() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const skipNextSave = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const res = await getJson<UserPreferencesDTO>("/api/me/preferences");
      if (res.ok) setText(res.data.stickyNote ?? "");
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const handle = setTimeout(() => {
      void patchJson<UserPreferencesDTO>("/api/me/preferences", {
        stickyNote: text || null,
      });
    }, 500);
    return () => clearTimeout(handle);
  }, [text, loaded]);

  // Close on Escape or a click outside the panel/FAB — the only way to close it used to be
  // clicking the exact same FAB that opened it, which read as "stuck open" to a user who didn't
  // know that. These are the two standard exits every floating panel in the app should support.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="fixed right-5 bottom-5 z-40">
      {open ? (
        <div className="mb-2 w-70 rounded-xl border border-black/10 bg-white p-3 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-navy">Quick Note</span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setText("")}
                className="text-[11px] text-gray hover:underline"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close quick note"
                className="flex h-5 w-5 items-center justify-center rounded text-gray transition hover:bg-black/5 hover:text-charcoal"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-3.5 w-3.5"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full resize-y rounded-md border border-black/15 p-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            placeholder="Jot something down…"
          />
        </div>
      ) : (
        // Only rendered when closed — the panel's own "×"/Escape/click-outside close it once
        // open, so a second, redundant close affordance sitting right under the panel isn't
        // needed (and was confusing: two things that both "close" it, right next to each other).
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Quick note"
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-navy text-xl text-white shadow-lg transition hover:opacity-90"
        >
          📝
          {text ? (
            <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-red ring-2 ring-white" />
          ) : null}
        </button>
      )}
    </div>
  );
}
