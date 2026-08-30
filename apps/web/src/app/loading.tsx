import { Spinner } from "@destaworks/ui/spinner";

/**
 * Streams immediately while the segment below resolves — including `(app)/layout.tsx`, which now
 * makes its own HTTP call to `apps/api` before the shell can render. Without a fallback here a
 * cold API turns a first load into a blank tab for as long as the round trip takes.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface/40">
      <Spinner className="h-6 w-6" label="Loading DestaHealth ATS" />
    </div>
  );
}
