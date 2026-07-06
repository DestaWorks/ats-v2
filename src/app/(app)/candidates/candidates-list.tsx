import Link from "next/link";
import type { CandidateListDTO } from "@/lib/validation/candidate";
import type { ListSort } from "@/lib/validation/pipeline";
import type { CandidateStatus, LicenseStatus, Track } from "@/lib/constants";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Table, Td } from "@/components/ui/table";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { STATUS_BG, TRACK_BADGE, licenseDotClass } from "../pipeline/lib/status-style";

/**
 * Server-rendered `/candidates` browse table. Everything is resolved by the backend
 * (`candidateService.listCandidates`) — filtering, sorting, and OFFSET pagination — and this
 * component only RENDERS the page it's handed and turns interactions into URL navigations:
 *  - the **Score** and **Created** column headers are `<Link>`s that flip the server `sort`
 *    (`fit` / `newest`↔`oldest`) and reset to page 1, with a direction arrow on the active one;
 *  - the numbered **pager** (Prev · 1 2 3 · Next) is `<Link>`s that change `?page=`.
 * No client state, no accumulation, no page-local score toggles — the RSC re-reads on every change.
 */

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Build a `/candidates` href from the current params with a mutation applied. */
function hrefWith(searchParams: SearchParams, mutate: (p: URLSearchParams) => void): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = one(value);
    if (v) p.set(key, v);
  }
  mutate(p);
  const qs = p.toString();
  return qs ? `/candidates?${qs}` : "/candidates";
}

/** Page numbers to render, with `"gap"` markers where pages are elided (…). */
function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = [1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total);
  const nums = [...new Set(wanted)].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

/** A directional sort arrow (points down for desc; rotated for asc). */
function SortArrow({ asc }: { asc?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={cn("h-3 w-3", asc && "rotate-180")}
    >
      <path
        d="M6 2.5v7M3 6.5 6 9.5l3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A faint up/down glyph marking an inactive-but-sortable header. */
function SortIdle() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-3 w-3 text-gray/50">
      <path
        d="M6 1.5 3.5 4h5L6 1.5ZM6 10.5 3.5 8h5L6 10.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CandidatesList({
  list,
  searchParams,
}: {
  list: CandidateListDTO;
  searchParams: SearchParams;
}) {
  const { candidates, total, page, pageSize, totalPages, hasPrev, hasNext } = list;

  const raw = one(searchParams.sort);
  const sort: ListSort = raw === "oldest" ? "oldest" : raw === "fit" ? "fit" : "newest";

  const sortHref = (target: ListSort) =>
    hrefWith(searchParams, (p) => {
      if (target === "newest") p.delete("sort");
      else p.set("sort", target);
      p.delete("page");
    });
  const pageHref = (n: number) =>
    hrefWith(searchParams, (p) => {
      if (n <= 1) p.delete("page");
      else p.set("page", String(n));
    });

  const headerLinkClass =
    "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-charcoal focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none";

  // Created header: active when sorting by date; toggles newest↔oldest (from fit → newest).
  const createdActive = sort === "newest" || sort === "oldest";
  const createdHeader = (
    <Link
      href={sortHref(sort === "newest" ? "oldest" : "newest")}
      aria-label={
        createdActive
          ? `Sorted by created date, ${sort === "newest" ? "newest first" : "oldest first"}. Activate to reverse.`
          : "Sort by created date, newest first."
      }
      className={cn(headerLinkClass, createdActive && "text-charcoal")}
    >
      Created
      {createdActive ? <SortArrow asc={sort === "oldest"} /> : <SortIdle />}
    </Link>
  );

  // Score header: active when sorting by fit (always desc); toggles fit on/off.
  const scoreActive = sort === "fit";
  const scoreHeader = (
    <Link
      href={sortHref(scoreActive ? "newest" : "fit")}
      aria-label={
        scoreActive
          ? "Sorted by fit score, highest first. Activate to clear the fit sort."
          : "Sort by fit score, highest first."
      }
      className={cn(headerLinkClass, scoreActive && "text-charcoal")}
    >
      Score
      {scoreActive ? <SortArrow /> : <SortIdle />}
    </Link>
  );

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="No candidates match"
        description="Try clearing or widening the filters, or add a new candidate."
      />
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + candidates.length;

  const footer = (
    <>
      <span className="text-xs text-gray tabular-nums">
        Showing {from}–{to} of {total}
      </span>
      <nav aria-label="Pagination" className="ml-auto flex items-center gap-1">
        {hasPrev ? (
          <Link
            href={pageHref(page - 1)}
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
              href={pageHref(item)}
              aria-label={`Page ${item}`}
              className="min-w-8 rounded-md px-2.5 py-1 text-center text-sm font-semibold text-charcoal tabular-nums transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
            >
              {item}
            </Link>
          ),
        )}
        {hasNext ? (
          <Link
            href={pageHref(page + 1)}
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

  return (
    <Table
      caption="Candidates"
      footer={footer}
      columns={[
        "Name",
        "Credential",
        "Track",
        "Client",
        scoreHeader,
        "Status",
        "License",
        "Days in stage",
        createdHeader,
      ]}
    >
      {candidates.map((c) => {
        const track = TRACK_BADGE[c.track as Track];
        return (
          <tr key={c.id} className="transition hover:bg-black/[0.03]">
            <Td>
              {/* Serif = a person; the rest of the row is their (sans) data. */}
              <Link
                href={`/candidates/${c.id}`}
                className="font-serif text-[15px] font-semibold text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
              >
                {c.name}
              </Link>
            </Td>
            <Td>{c.credential ?? <span className="text-gray">—</span>}</Td>
            <Td>
              {track ? (
                <span
                  className={cn(
                    "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                    track.className,
                  )}
                >
                  {track.label}
                </span>
              ) : (
                <span className="text-gray">{c.track}</span>
              )}
            </Td>
            <Td>{c.clientName ?? <span className="text-gray italic">Unassigned</span>}</Td>
            <Td>
              <ScoreBadge score={c.score} />
            </Td>
            <Td>
              {/* Stage rail — a stage-colored tick + label; same code→color the board reads. */}
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <span
                  aria-hidden
                  className={cn(
                    "h-4 w-1 shrink-0 rounded-full",
                    STATUS_BG[c.status as CandidateStatus] ?? "bg-gray",
                  )}
                />
                <span className="text-charcoal">{c.statusLabel}</span>
              </span>
            </Td>
            <Td>
              {/* Dot (a state) — deliberately not a bar, so license never reads as a stage. */}
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    licenseDotClass(c.licenseStatus as LicenseStatus),
                  )}
                />
                <span className="text-charcoal">{c.licenseStatus}</span>
              </span>
            </Td>
            <Td className="text-gray tabular-nums">{c.daysInStage}d</Td>
            <Td className="whitespace-nowrap text-gray tabular-nums">{formatDate(c.createdAt)}</Td>
          </tr>
        );
      })}
    </Table>
  );
}
