import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";
import { fieldClass } from "./input";

/**
 * Select primitive — the same field look as `Input`. Merges `className` last (`max-w-xs`, …),
 * spreads native `<select>` props, and forwards a ref. `scheme-light` pins the NATIVE popup to
 * a white background even under OS dark mode (the app is light-only; browsers style the popup
 * from the element's computed color-scheme).
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldClass, "scheme-light", className)} {...props}>
        {children}
      </select>
    );
  },
);
