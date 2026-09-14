"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ReportExportDTO } from "@destaworks/contracts/validation/reports";
import { getJson, messageForFailure, postJson } from "@/lib/api/client";
import { Spinner } from "@destaworks/ui/spinner";
import type { ReportFilterState } from "./lib/use-report-fetch";

/**
 * Export CSV, via the async job endpoints rather than a direct link.
 *
 * It used to be an `<a href="/api/reports/export?…">` — a browser NAVIGATION, which cannot survive
 * the move to `apps/api`: a top-level cross-origin request sends no session cookie unless the
 * cookie is `SameSite=None`, so the download would arrive unauthenticated. Going through
 * `POST /reports/export/jobs` keeps it on the same credentialed path as every other browser call,
 * and the file itself comes back as a signed URL that needs no session at all.
 */
const POLL_MS = 1500;
const MAX_POLLS = 80;

export function ExportCsvButton({ filters }: { filters: ReportFilterState }) {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const created = await postJson<ReportExportDTO>("/api/reports/export/jobs", filters);
      if (!created.ok) {
        toast.error(messageForFailure(created.failure));
        return;
      }

      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        const polled = await getJson<ReportExportDTO>(
          `/api/reports/export/jobs/${encodeURIComponent(created.data.id)}`,
        );
        if (!polled.ok) {
          toast.error(messageForFailure(polled.failure));
          return;
        }
        if (polled.data.status === "ready" && polled.data.downloadUrl) {
          window.location.assign(polled.data.downloadUrl);
          return;
        }
        if (polled.data.status === "failed") {
          toast.error("The export could not be built. Please try again.");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      toast.error("The export is taking longer than expected — check back shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={busy}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-black/15 px-3 text-sm font-semibold text-navy hover:bg-black/[0.03] disabled:opacity-60"
    >
      {busy ? <Spinner /> : null}
      {busy ? "Preparing…" : "Export CSV"}
    </button>
  );
}
