import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Container panel primitive for the repeated `rounded-xl border border-black/5
 * bg-white` cards (dashboard stat/section panels, the terminal rail). Base classes
 * are the most common variant; callers add padding/layout and override the rest via
 * `className` (merged last). Polymorphic via `as` so semantic wrappers (`section`,
 * `aside`) keep their element + a11y attributes instead of collapsing to a `div`.
 */
export function Card<T extends ElementType = "div">({
  as,
  className,
  children,
  ...props
}: {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={cn("rounded-xl border border-black/5 bg-white", className)} {...props}>
      {children}
    </Tag>
  );
}
