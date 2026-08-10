"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserCircleIcon, ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils/cn";

/**
 * Header account menu (2026-07-31) — consolidates what used to be a standalone avatar/name
 * display + a separate "Sign out" button into one dropdown, the standard "click your avatar for
 * account actions" pattern. "My Profile" moved here from the sidebar (see `lib/nav.ts`).
 *
 * Panel design takes cues from a few reference account menus (Notion/Google/Supabase-style):
 * a repeated avatar/name/email header card at the top of the panel (not just the trigger — the
 * trigger's name/role is hidden below `sm`, so the panel is the only place it's guaranteed
 * visible), then icon+label rows in a fixed-width aligned gutter with SMALL, MUTED icons —
 * icons read as secondary to the label text, never competing with it, unlike the sidebar's
 * same-weight-as-text treatment.
 *
 * Same close conventions established this session (Quick Note, row-inspect modal): an explicit
 * close isn't needed here since choosing either menu item navigates/signs out, but Escape and
 * click-outside both close it without acting.
 */
/** Circular avatar — the real uploaded photo (Wave 6) when present, falling back to an initial. */
function AvatarCircle({
  image,
  initial,
  size,
}: {
  image: string | null;
  initial: string;
  size: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-base";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a user-uploaded Storage URL, not a static asset
      <img src={image} alt="" className={cn("shrink-0 rounded-full object-cover", dims)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-navy/10 font-bold text-navy",
        dims,
      )}
    >
      {initial}
    </span>
  );
}

export function UserMenu({
  userName,
  userEmail,
  userRole,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: session } = useSession();
  const image = session?.user?.image ?? null;
  const initial = (userName.trim()[0] ?? "?").toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
      >
        <AvatarCircle image={image} initial={initial} size="sm" />
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="text-sm font-bold text-charcoal">{userName}</span>
          <span className="text-xs text-gray">{userRole}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className={cn("h-3.5 w-3.5 text-gray transition-transform", open ? "rotate-180" : "")}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <AvatarCircle image={image} initial={initial} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-charcoal">{userName}</p>
              <p className="truncate text-xs text-gray">{userEmail}</p>
            </div>
          </div>

          <div className="border-t border-black/5 py-1">
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-charcoal transition hover:bg-black/5"
            >
              <UserCircleIcon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-gray" />
              My Profile
            </Link>
          </div>

          <div className="border-t border-black/5 py-1">
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={() => void onSignOut()}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-red transition hover:bg-red/5 disabled:opacity-50"
            >
              <ArrowRightStartOnRectangleIcon
                aria-hidden="true"
                className="h-[18px] w-[18px] shrink-0 text-red/70"
              />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
