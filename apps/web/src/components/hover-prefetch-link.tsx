"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";

/**
 * A link that prefetches on INTENT rather than on sight.
 *
 * Next's default prefetches every link in the viewport, which suits a page of a few links and not
 * a table: a list of N rows issues N prefetches before anyone clicks, and the count grows with the
 * page size rather than with what the user does. Each is a render on the Next server — cheap
 * individually, linear in rows, and entirely speculative.
 *
 * Hovering is the cheapest honest signal of intent, and it arrives early enough to matter: the gap
 * between a cursor landing and the click is typically long enough for the payload to be in the
 * router cache by the time it is needed. So the fast-feeling navigation is kept, and the cost falls
 * from "every row rendered" to "the row someone is actually going to open".
 *
 * `prefetched` guards against re-requesting on every re-entry of the same link; the router caches
 * the payload anyway, but there is no reason to ask it again.
 */
export function HoverPrefetchLink({
  href,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const router = useRouter();
  const prefetched = useRef(false);

  function warm() {
    if (prefetched.current) return;
    prefetched.current = true;
    router.prefetch(String(href));
  }

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={warm}
      // Keyboard and touch reach the same intent by a different route; without these the pattern
      // would quietly make the app slower for anyone not using a mouse.
      onFocus={warm}
      onTouchStart={warm}
      {...rest}
    >
      {children}
    </Link>
  );
}
