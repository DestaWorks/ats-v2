"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { OpenRoleListDTO } from "@/lib/validation/open-role";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pager } from "@/components/ui/pager";
import { Table, Td } from "@/components/ui/table";
import { formatDate } from "@/lib/utils/format-date";
import { pageHrefFor } from "@/lib/pagination";
import { PRIORITY_TONE, STATUS_TONE } from "./lib/role-style";

/**
 * `/roles` browse table — matches the `candidates/candidates-list.tsx` table pattern (navy header,
 * `Table`/`Td` primitives, numbered pager in the footer) instead of the earlier card grid. The RSC
 * SSR-renders one OFFSET page as `initial`; filters live in the sibling `<RoleFilters>` and
 * "+ Add role" in the page HEADER (both siblings, not children, of this component — matches
 * `candidates/page.tsx`) and are read back from the URL by the RSC. No bulk actions/undo (legacy
 * has none for roles) — delete is a hard, per-row confirm on the detail page.
 */
export function RolesInventory({ initial }: { initial: OpenRoleListDTO }) {
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
    <Pager
      page={page}
      totalPages={totalPages}
      hasPrev={hasPrev}
      hasNext={hasNext}
      from={from}
      to={to}
      total={total}
      hrefFor={pHref}
    />
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
