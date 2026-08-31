import Link from "next/link";

/**
 * Same posture as `next.config.ts`'s `originFromEnvUrl`: an env var holding a URL, parsed once,
 * `null` when it is unset or unparseable. Unset renders NO link rather than a dead one.
 */
function urlFromEnv(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

const PLATFORM_HUB_URL = urlFromEnv(process.env.NEXT_PUBLIC_PLATFORM_HUB_URL);

/**
 * The dark-glass brand surface every pre-application screen renders inside — the gradient, the
 * grid overlay, the wordmark, the card and the platform-hub link. It carries no tab toggle and no
 * copy of its own, so it can be shared by screens that answer different questions: `(auth)` asks
 * "who are you", `(gate)` asks "which workspace".
 */
export function AuthChrome({ children }: { children: React.ReactNode }) {
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

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-7">{children}</div>

        {PLATFORM_HUB_URL !== null ? (
          <div className="text-center">
            <Link
              href={PLATFORM_HUB_URL}
              className="text-[11px] tracking-wide text-ivory/30 hover:text-ivory/50"
            >
              ← All Platforms
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Shell for the SIGNED-OUT screens (legacy parity — `legacy/index.html:1051-1166`, the
 * `ph==="auth"` screen). Legacy renders sign-in and request-access as CLIENT-STATE tabs on one
 * URL; here each is a real route (`/sign-in`, `/request-access`) so both stay bookmarkable, and
 * the toggle just navigates between them. `activeTab: null` (reset-password, forgot-password —
 * not legacy screens, no tab they belong under) omits the toggle row entirely.
 *
 * The tab row is what makes this shell specific to `(auth)`: it offers "Sign In" and "Request
 * Access", and both are wrong for someone already holding a session. `(gate)` composes
 * `AuthChrome` directly for that reason.
 */
export function AuthShell({
  activeTab,
  children,
}: {
  activeTab: "signin" | "request" | null;
  children: React.ReactNode;
}) {
  return (
    <AuthChrome>
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
    </AuthChrome>
  );
}
