/**
 * Client Portal shell (Wave 4.3) — deliberately minimal: no internal `AppNav`/`AppHeader`, no
 * access to any internal view. Kept in this app's existing design system (navy/serif) rather
 * than porting legacy's separate teal/cream branding — one consistent look across the product,
 * not a forked palette for one surface.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface/40">
      <header className="border-b border-black/5 bg-white px-6 py-4">
        <p className="font-serif text-lg font-bold text-navy">DestaHealth ATS</p>
        <p className="text-xs text-gray">Client Portal</p>
      </header>
      <main id="content">{children}</main>
    </div>
  );
}
