import { hasPlatformCapability } from "@destaworks/domain/platform";
import { Refusal } from "../../components/refusal";
import { platformGate } from "../../lib/platform-session";
import { ConsoleNav } from "./console-nav";
import { CONSOLE_NAV } from "./nav";

/**
 * The gate for every console route, and the console's chrome.
 *
 * Nothing under `(console)` renders without a verified `PlatformContext`. The two refusals are
 * terminal — see `components/refusal.tsx` for why neither redirects into a tenant.
 *
 * Hiding a navigation item the viewer lacks the capability for is UX; the API re-checks every
 * platform capability inside the same call that writes the audit row, so a hidden link is never
 * the thing stopping anyone.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const gate = await platformGate();
  if (gate.outcome !== "granted") return <Refusal reason={gate.outcome} />;

  const items = CONSOLE_NAV.filter((item) => hasPlatformCapability(gate.context, item.capability));

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#content"
        className="sr-only rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-white px-4 py-3">
        <div>
          <span className="font-serif text-base tracking-[0.15em] text-charcoal">DESTAWORKS</span>
          <span className="ml-2 text-xs font-semibold tracking-wide text-gray uppercase">
            Platform console
          </span>
        </div>
        <span className="text-xs text-gray">{gate.context.user.email}</span>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <ConsoleNav items={items} />
        <main id="content" className="min-w-0 flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
