import Link from "next/link";

/**
 * Shared dark-glass shell for the sign-in / request-access / reset-password screens (legacy
 * parity — `legacy/index.html:1051-1166`, the `ph==="auth"` screen). Legacy renders sign-in and
 * request-access as CLIENT-STATE tabs on one URL; here each is a real route (`/sign-in`,
 * `/request-access`) so both stay bookmarkable/back-button-friendly — the tab toggle just
 * navigates between them, same visual result, better routing. `activeTab: null` (reset-password,
 * 2026-08-02 — not a legacy screen, no tab it belongs under) omits the toggle row entirely, since
 * switching away mid-reset doesn't make sense. Server component: only the form bodies need client
 * interactivity.
 */
export function AuthShell({
  activeTab,
  children,
}: {
  activeTab: "signin" | "request" | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#0a0a1a_0%,#0f1628_40%,#151015_100%)] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="relative z-10 flex w-full max-w-[420px] flex-col gap-4">
        <div className="text-center">
          <p className="font-serif text-[13px] tracking-[0.35em] text-brand">DESTA WORKS</p>
          <p className="mt-1 font-serif text-2xl text-ivory">DestaHealth ATS</p>
          <p className="mt-1 text-xs tracking-widest text-ivory/25">
            HEALTHCARE RECRUITING PIPELINE
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-7">
          {activeTab !== null ? (
            <div className="mb-5 flex gap-0.5 rounded-lg bg-white/[0.04] p-[3px]">
              <Link
                href="/sign-in"
                className={
                  "flex-1 rounded-md py-2.5 text-center text-[13px] font-semibold transition " +
                  (activeTab === "signin" ? "bg-white/10 text-ivory" : "text-ivory/35")
                }
              >
                Sign In
              </Link>
              <Link
                href="/request-access"
                className={
                  "flex-1 rounded-md py-2.5 text-center text-[13px] font-semibold transition " +
                  (activeTab === "request" ? "bg-white/10 text-ivory" : "text-ivory/35")
                }
              >
                Request Access
              </Link>
            </div>
          ) : null}

          {children}
        </div>

        <div className="text-center">
          <Link
            href="https://biruhmezgebu1.github.io/desta-platform/"
            className="text-[11px] tracking-wide text-ivory/30 hover:text-ivory/50"
          >
            ← All Platforms
          </Link>
        </div>
      </div>
    </div>
  );
}
