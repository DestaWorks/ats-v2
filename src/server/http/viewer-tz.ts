import "server-only";
import { cookies } from "next/headers";
import { parseTzOffset } from "@/lib/daily";

/**
 * The viewer's UTC offset in `Date.getTimezoneOffset()` minutes, from the `app-tz` cookie that
 * `useTzCookieSync` keeps current. `undefined` when the cookie is absent or unusable — the
 * caller decides what to do then, because the server host's own offset (UTC) is NOT the
 * viewer's and must never be substituted silently.
 */
export async function viewerTzOffset(): Promise<number | undefined> {
  const store = await cookies();
  return parseTzOffset(store.get("app-tz")?.value);
}
