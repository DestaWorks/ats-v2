"use client";

import { useEffect } from "react";

/**
 * Keeps the shared `app-tz` cookie (browser tz offset minutes, `Date.getTimezoneOffset()`
 * convention) in sync with the live value. `/daily-log`, `/weekly-brief`, and Dashboard's daily
 * strip all read this SAME cookie server-side (perf audit 2026-08-05) to seed their "today"/
 * "this week" data on the NEXT visit instead of fetching it client-side after mount — see each
 * page's own comment for the seed-and-skip-first-fetch mechanics. Plain cookie write, no network
 * request; previously reimplemented identically in all three call sites.
 */
export function useTzCookieSync(tz: number): void {
  useEffect(() => {
    const current = String(tz);
    const match = document.cookie.match(/(?:^|; )app-tz=([^;]*)/);
    if (!match || match[1] !== current) {
      document.cookie = `app-tz=${current}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [tz]);
}
