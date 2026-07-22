"use client";

import { useEffect, useRef, useState } from "react";
import { getJson, patchJson } from "@/lib/api/client";
import type { UserPreferencesDTO } from "@/lib/validation/user-preferences";

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
      void patchJson("/api/me/preferences", { stickyNote: text || null });
    }, 500);
    return () => clearTimeout(handle);
  }, [text, loaded]);

  return (
    <div className="fixed right-5 bottom-5 z-40">
      {open ? (
        <div className="mb-2 w-70 rounded-xl border border-black/10 bg-white p-3 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-bold text-navy">Quick Note</span>
            <button
              type="button"
              onClick={() => setText("")}
              className="text-[11px] text-gray hover:underline"
            >
              Clear
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full resize-y rounded-md border border-black/15 p-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            placeholder="Jot something down…"
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick note"
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-navy text-xl text-white shadow-lg transition hover:opacity-90"
      >
        📝
        {text ? (
          <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-red ring-2 ring-white" />
        ) : null}
      </button>
    </div>
  );
}
