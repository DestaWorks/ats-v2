"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { OpenRoleListItemDTO } from "@/lib/validation/open-role";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { formatDate } from "@/lib/utils/format-date";
import { pageHrefFor, pageItems } from "../lib/pager";
import { PRIORITY_TONE, STATUS_TONE } from "./lib/role-style";

export interface RoleListDTO {
  roles: OpenRoleListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * `/roles` browse table — matches the `candidates/candidates-list.tsx` table pattern (navy header,
 * `Table`/`Td` primitives, numbered pager in the footer) instead of the earlier card grid. The RSC
 * SSR-renders one OFFSET page as `initial`; filters live in the sibling `<RoleFilters>` and
 * "+ Add role" in the page HEADER (both siblings, not children, of this component — matches
 * `candidates/page.tsx`) and are read back from the URL by the RSC. No bulk actions/undo (legacy
 * has none for roles) — delete is a hard, per-row confirm on the detail page.
 */
export function RolesInventory({ initial }: { initial: RoleListDTO }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { roles, page, pageSize, totalPages, hasPrev, hasNext, total } = initial;
  const from = roles.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + roles.length;
  const pHref = (n: number) => pageHrefFor(pathname, searchParams, n);

  if (roles.length === 0) {
    return <EmptyState title="No roles" description="No open roles match these filters yet." />;
  }

  const footer = (
    <>
      <span className="text-xs text-gray tabular-nums">
        Showing {from}–{to} of {total}
      </span>
      <nav aria-label="Pagination" className="ml-auto flex items-center gap-1">
        {hasPrev ? (
          <Link
            href={pHref(page - 1)}
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
              href={pHref(item)}
              aria-label={`Page ${item}`}
              className="min-w-8 rounded-md px-2.5 py-1 text-center text-sm font-semibold text-charcoal tabular-nums transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
            >
              {item}
            </Link>
          ),
        )}
        {hasNext ? (
          <Link
            href={pHref(page + 1)}
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
      caption="Open roles"
      footer={footer}
      columns={[
        "Title",
        "Client",
        "Credential",
        "State",
        "Setting",
        "Status",
        "Priority",
        "Rate",
        "Created",
      ]}
    >
      {roles.map((role) => (
        <tr key={role.id} className="transition hover:bg-black/[0.03]">
          <Td>
            <Link
              href={`/roles/${role.id}`}
              className="font-serif text-[15px] font-semibold text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
            >
              {role.title}
            </Link>
          </Td>
          <Td>{role.clientName}</Td>
          <Td>{role.credential ?? <span className="text-gray">—</span>}</Td>
          <Td>{role.state ?? <span className="text-gray">—</span>}</Td>
          <Td>{role.setting ?? <span className="text-gray">—</span>}</Td>
          <Td>
            <Badge tone={STATUS_TONE[role.status]}>{role.status}</Badge>
          </Td>
          <Td>
            <Badge tone={PRIORITY_TONE[role.priority]}>{role.priority}</Badge>
          </Td>
          <Td>{role.rate ?? <span className="text-gray">—</span>}</Td>
          <Td className="whitespace-nowrap text-gray tabular-nums">{formatDate(role.createdAt)}</Td>
        </tr>
      ))}
    </Table>
  );
}
