/** Dark-glass input, matching the legacy auth screen's field treatment (translucent white on the
 *  gradient card) — deliberately NOT the shared light-theme `Input`/`Field` primitives, which
 *  assume a white page background. Shared by the sign-in and request-access forms. */
export const authInputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-ivory outline-none placeholder:text-ivory/25 focus:border-white/25";

export function AuthLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[11px] tracking-wide text-ivory/40 uppercase"
    >
      {children}
    </label>
  );
}
