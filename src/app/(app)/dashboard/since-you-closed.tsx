"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RecapDTO } from "@/lib/validation/daily";
import { getJson } from "@/lib/api/client";

/**
 * "Since you closed" (legacy Overview recap). Last-seen lives in localStorage per user (legacy
 * parity — per-browser, not synced) and advances only after a 30s dwell, so a quick glance
 * doesn't wipe the recap. Hidden under 1 hour or when nothing happened. Buckets come from
 * `GET /api/daily/recap` (domain tables — no audit capability needed); mentions live in the
 * Alerts bell, not here.
 */
export function SinceYouClosed({ userId }: { userId: string }) {
  const [recap, setRecap] = useState<RecapDTO | null>(null);
  const [label, setLabel] = useState("");

  useEffect(() => {
    const key = `desta_ats_lastSeen_${userId}`;
    const prev = localStorage.getItem(key);
    // Advance last-seen only after a 30s dwell (legacy line 508).
    const dwell = setTimeout(() => localStorage.setItem(key, new Date().toISOString()), 30_000);

    if (prev) {
      const since = new Date(prev);
      const hours = Math.round((Date.now() - since.getTime()) / 3_600_000);
      if (hours >= 1) {
        setLabel(hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`);
        void getJson<RecapDTO>(`/api/daily/recap?since=${encodeURIComponent(prev)}`).then((res) => {
          if (res.ok) setRecap(res.data);
        });
      }
    }
    return () => clearTimeout(dwell);
  }, [userId]);

  if (!recap) return null;
  const total = recap.added.count + recap.moves.count + recap.outreach.count;
  if (total === 0) return null;

  const row = (href: string, accent: string, title: string, detail: string) => (
    <Link
      href={href}
      className={`block rounded-md border-l-[3px] px-3 py-1.5 transition hover:bg-black/[0.03] ${accent}`}
    >
      <span className="block text-sm font-semibold text-charcoal">{title}</span>
      {detail ? <span className="block text-xs text-gray">{detail}</span> : null}
    </Link>
  );

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-black/5 bg-white p-4">
      <p className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
        Since you closed · {label}
      </p>
      {recap.added.count > 0
        ? row(
            "/pipeline",
            "border-green",
            `+${recap.added.count} added`,
            recap.added.names.join(", "),
          )
        : null}
      {recap.moves.count > 0
        ? row(
            "/pipeline",
            "border-orange",
            `→ ${recap.moves.count} stage move${recap.moves.count === 1 ? "" : "s"}`,
            recap.moves.names.join(", "),
          )
        : null}
      {recap.outreach.count > 0
        ? row(
            "/sourcing",
            "border-navy",
            `📨 ${recap.outreach.count} outreach`,
            `${recap.outreach.actors.join(", ")} logged outreach`,
          )
        : null}
    </section>
  );
}
