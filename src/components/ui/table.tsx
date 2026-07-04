import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Accessible data-table primitive. Wraps a semantic `<table>` in a horizontally
 * scrollable container (so wide reports don't blow out the layout) and applies the
 * shared zebra/hover look. Headers are provided as `columns` and rendered as
 * `<th scope="col">`; the visually-hidden-friendly `caption` labels the table for
 * assistive tech. `className` is merged onto the `<table>` last for overrides.
 *
 * Generic on purpose — the Wave 1.3 import report is the first consumer, but this is a
 * genuine shared primitive for later reports / CRM lists. Callers render their own
 * `<tr>`/`<td>` rows as `children` (use the exported `Td`/`Th` if you want the padding
 * to match the header cells).
 */

export function Table({
  caption,
  columns,
  children,
  className,
  captionVisible = false,
}: {
  /** Accessible name for the table (always rendered; visually hidden unless `captionVisible`). */
  caption: string;
  /** Column header labels, rendered as `<th scope="col">`. */
  columns: ReactNode[];
  /** The `<tbody>` rows (`<tr><td>…</td></tr>`). */
  children: ReactNode;
  className?: string;
  captionVisible?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/5">
      <table className={cn("w-full border-collapse text-left text-sm", className)}>
        <caption
          className={cn(
            captionVisible
              ? "px-3 py-2 text-left text-xs font-semibold tracking-wide text-gray uppercase"
              : "sr-only",
          )}
        >
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-black/10 bg-black/[0.03]">
            {columns.map((col, i) => (
              <th
                key={i}
                scope="col"
                className="px-3 py-2 text-xs font-semibold tracking-wide text-gray uppercase"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">{children}</tbody>
      </table>
    </div>
  );
}

/** A body cell with padding matching the header. `className` merged last. */
export function Td({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("px-3 py-2 align-top text-charcoal", className)}>{children}</td>;
}
