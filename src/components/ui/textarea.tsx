import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";
import { fieldClass } from "./input";

/**
 * Textarea primitive — the same field look as `Input`. Callers add `resize-y` (and any rows) via
 * props/`className`. Spreads native `<textarea>` props and forwards a ref.
 */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldClass, className)} {...props} />;
});
