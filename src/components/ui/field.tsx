import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Form field wrapper — label + control + hint + error. Wires the error to the
 * control via `aria-describedby`/`role="alert"` for accessible forms. Pair with
 * `useZodForm` and register the control inside `children`.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-charcoal">
        {label}
        {required ? <span className="ml-0.5 text-red">*</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-xs text-gray">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
