import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Accessible data-table primitive. Wraps a semantic `<table>` in a card with an optional
 * `toolbar` (filters / view toggles) and `footer` (pagination / result count) rendered INSIDE
 * the same bordered container — only the table body scrolls horizontally, so a wide table never
 * drags its toolbar or pagination out of view. Headers are provided as `columns` and rendered as
 * `<th scope="col">`; the visually-hidden-friendly `caption` labels the table for assistive tech.
 * `className` is merged onto the `<table>` last for overrides.
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
  toolbar,
  footer,
}: {
  /** Accessible name for the table (always rendered; visually hidden unless `captionVisible`). */
  caption: string;
  /** Column header labels, rendered as `<th scope="col">`. */
  columns: ReactNode[];
  /** The `<tbody>` rows (`<tr><td>…</td></tr>`). */
  children: ReactNode;
  className?: string;
  captionVisible?: boolean;
  /** Optional toolbar rendered above the table, inside the card (view toggles, counts, actions). */
  toolbar?: ReactNode;
  /** Optional footer rendered below the table, inside the card (pagination, result count). */
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/5 bg-white">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-3 py-2">
          {toolbar}
        </div>
      ) : null}
      <div className="overflow-x-auto">
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
          {/* Legacy-parity header: filled navy band with white labels. */}
          <thead>
            <tr className="bg-navy">
              {columns.map((col, i) => (
                <th
                  key={i}
                  scope="col"
                  className="px-3 py-2.5 text-[13px] font-semibold text-white"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">{children}</tbody>
        </table>
      </div>
      {footer ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-black/5 px-3 py-2.5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** A body cell with padding matching the header. `className` merged last. */
export function Td({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("px-3 py-2 align-top text-charcoal", className)}>{children}</td>;
}
