import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

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

/**
 * Password visibility toggle (design pass 2026-08-04) — an eye/eye-slash icon instead of a
 * "SHOW"/"HIDE" text label, matching the icon-first idiom the rest of the app uses. Shared by
 * sign-in and reset-password, positioned absolutely inside the input's wrapper (`relative`).
 */
export function PasswordToggleButton({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const Icon = visible ? EyeSlashIcon : EyeIcon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      className="absolute top-1/2 right-3.5 -translate-y-1/2 text-ivory/40 hover:text-ivory/70"
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
}
