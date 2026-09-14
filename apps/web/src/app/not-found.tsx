import Link from "next/link";
import { buttonClasses } from "@destaworks/ui/button";

/** Global 404 — an address that matches no route at all, outside the app shell. */
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface/40 p-6">
      <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-8 text-center">
        <p className="font-serif text-[11px] tracking-[0.3em] text-brand">DESTA WORKS</p>
        <h1 className="mt-3 text-lg font-bold text-navy">Page not found</h1>
        <p className="mt-2 text-sm text-gray">
          That address doesn&rsquo;t exist in DestaHealth ATS. It may have been renamed or removed.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <Link href="/dashboard" className={buttonClasses()}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
