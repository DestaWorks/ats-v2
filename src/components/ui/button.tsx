import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

/**
 * Shared button primitive. Extracted from the buttons hand-rolled across auth /
 * resume / pipeline / dashboard so they share one canonical look. Variant + size
 * classes reproduce the exact class sets those consumers used (visual parity), and
 * `className` is merged last so callers can add layout utilities (`self-start`,
 * `mt-2`, …). Spreads native `<button>` props (`type`, `onClick`, `disabled`,
 * `aria-*`) and forwards a ref to the underlying element.
 *
 * `loading` renders the shared `<Spinner>` inline (folding in the resume SaveBar's
 * spinner + label pattern) and disables the button.
 */

export type ButtonVariant = "primary" | "success" | "secondary" | "danger" | "ghost" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

/** Color + font-weight + hover per variant (padding/text-size come from `size`). */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white font-semibold hover:opacity-90",
  success: "bg-green text-white font-semibold hover:opacity-90",
  secondary: "border border-black/15 text-charcoal font-semibold hover:bg-black/5",
  danger: "bg-red text-white font-semibold hover:opacity-90",
  ghost: "text-gray font-medium hover:bg-black/5",
  link: "text-navy font-semibold hover:underline",
};

/** Padding + text-size per size. */
const SIZE: Record<ButtonSize, string> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show an inline spinner and disable the button while an action is in flight. */
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "rounded-md transition focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner className="h-4 w-4 text-current" label="Loading" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
});
