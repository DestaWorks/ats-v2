"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root-layout error boundary — the one place a thrown error can occur OUTSIDE every other
 * `error.tsx` boundary in the tree (a crash in the root layout itself), so Next.js requires this
 * exact file/name to catch it; a nested `error.tsx` can't. Replaces the entire page, including
 * `<html>`/`<body>` — there is no parent layout left to render around it.
 *
 * `Sentry.captureException` here is a deliberate, explicit call (not automatic): `error.message`
 * goes to Sentry as-is, relying on this codebase's existing discipline of never interpolating
 * PII into a thrown error's message (the same discipline `AppError` messages already rely on
 * everywhere else) — see `lib/monitoring/sentry-scrub.ts` for what IS scrubbed automatically.
 * A no-op when Sentry isn't configured (`NEXT_PUBLIC_SENTRY_DSN` unset).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f0f2f5" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              maxWidth: "26rem",
              textAlign: "center",
              background: "#fff",
              borderRadius: "1rem",
              padding: "2.5rem 2rem",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            }}
          >
            <h1 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#c0392b", margin: 0 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#2d2d2d", marginTop: "0.5rem" }}>
              DestaHealth ATS hit an unexpected error. Try again, or reload the page.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: "1.25rem",
                padding: "0.625rem 1.5rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "#1e4a8a",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
