import { AlertsBell } from "./alerts-bell";
import { SignOutButton } from "./sign-out-button";

/**
 * The app-shell TOP header (legacy parity): serif DESTA WORKS wordmark + "ATS" on the left;
 * Alerts pill · avatar-initial + name/role · Sign Out on the right. Server component — the two
 * interactive children (`AlertsBell`, `SignOutButton`) are client components.
 */
export function AppHeader({ userName, userRole }: { userName: string; userRole: string }) {
  const initial = (userName.trim()[0] ?? "?").toUpperCase();
  return (
    <header className="no-print sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-black/10 bg-white px-5 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-lg font-semibold tracking-[0.18em] whitespace-nowrap">
          <span className="text-charcoal">DESTA</span>
          <span className="text-brand">WORKS</span>
        </span>
        <span aria-hidden="true" className="text-black/15">
          |
        </span>
        <span className="text-sm font-bold tracking-wide text-navy">ATS</span>
      </div>

      <div className="flex items-center gap-3">
        <AlertsBell viewerFirstName={userName.split(" ")[0] ?? userName} />
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-navy/10 text-sm font-bold text-navy"
          >
            {initial}
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-bold text-charcoal">{userName}</span>
            <span className="text-xs text-gray">{userRole}</span>
          </span>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
