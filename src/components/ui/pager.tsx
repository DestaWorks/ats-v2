import Link from "next/link";
import { pageItems } from "@/lib/pagination";

/**
 * The numbered-pager footer (← Prev · page numbers with gap markers · Next →) shared by every
 * OFFSET-paginated list (candidates, sourcing, roles) — was duplicated ~58 lines per page. Renders
 * WITHOUT an outer wrapper (so it drops straight into `<Table footer={...}>`, which already
 * supplies the bordered/padded shell); callers that don't use `<Table>` wrap it themselves.
 * `hrefFor` is resolved by the caller so this component stays agnostic to how the URL is built
 * (`useSearchParams()` client hook vs. an RSC `searchParams` prop).
 */
export function Pager({
  page,
  totalPages,
  hasPrev,
  hasNext,
  from,
  to,
  total,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  from: number;
  to: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  return (
    <>
      <span className="text-xs text-gray tabular-nums">
        Showing {from}–{to} of {total}
      </span>
      <nav aria-label="Pagination" className="ml-auto flex items-center gap-1">
        {hasPrev ? (
          <Link
            href={hrefFor(page - 1)}
            rel="prev"
            className="rounded-md border border-black/15 px-2.5 py-1 text-sm font-semibold text-charcoal transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          >
            ← Prev
          </Link>
        ) : (
          <span className="rounded-md border border-black/10 px-2.5 py-1 text-sm font-semibold text-gray/50">
            ← Prev
          </span>
        )}
        {pageItems(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} className="px-1.5 text-sm text-gray">
              …
            </span>
          ) : item === page ? (
            <span
              key={item}
              aria-current="page"
              className="min-w-8 rounded-md bg-navy px-2.5 py-1 text-center text-sm font-semibold text-white tabular-nums"
            >
              {item}
            </span>
          ) : (
            <Link
              key={item}
              href={hrefFor(item)}
              aria-label={`Page ${item}`}
              className="min-w-8 rounded-md px-2.5 py-1 text-center text-sm font-semibold text-charcoal tabular-nums transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
            >
              {item}
            </Link>
          ),
        )}
        {hasNext ? (
          <Link
            href={hrefFor(page + 1)}
            rel="next"
            className="rounded-md border border-black/15 px-2.5 py-1 text-sm font-semibold text-charcoal transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          >
            Next →
          </Link>
        ) : (
          <span className="rounded-md border border-black/10 px-2.5 py-1 text-sm font-semibold text-gray/50">
            Next →
          </span>
        )}
      </nav>
    </>
  );
}
