import Link from "next/link";
import type {
  PlatformTenantDTO,
  TenantHealthLevel,
  TenantHealthSignal,
} from "@destaworks/contracts/validation/tenant";
import { Badge, type BadgeTone } from "@destaworks/ui/badge";
import { DonutChart } from "@destaworks/ui/donut-chart";
import { EmptyState } from "@destaworks/ui/empty-state";
import { ErrorState } from "@destaworks/ui/error-state";
import { Meter } from "@destaworks/ui/meter";
import { Table, Td } from "@destaworks/ui/table";
import { listPlatformTenants } from "../../../lib/platform-api";

export const metadata = { title: "Health · Platform Console" };

const LEVEL_TONE: Record<TenantHealthLevel, BadgeTone> = {
  critical: "danger",
  warning: "amber",
  ok: "success",
};

/** Health has its own meaning, so it gets its own colours rather than the categorical palette. */
const LEVEL_COLOR: Record<TenantHealthLevel, string> = {
  critical: "#b5546a",
  warning: "#c47f2e",
  ok: "#5a8f4a",
};

/** What each signal means to an operator, who should not have to read `healthOf` to find out. */
const SIGNAL_LABEL: Record<TenantHealthSignal, string> = {
  suspended: "Suspended — every member is refused",
  "trial-expired": "Trial ended",
  "no-active-members": "Nobody can sign in",
  "over-seat-limit": "Over its seat limit",
  "at-seat-limit": "At its seat limit",
  "trial-ending-soon": "Trial ending soon",
};

const RANK: Record<TenantHealthLevel, number> = { critical: 0, warning: 1, ok: 2 };
const LEVELS = ["critical", "warning", "ok"] as const;

function seats(tenant: PlatformTenantDTO): string {
  const { used, limit } = tenant.health.seats;
  return limit === null ? `${used}` : `${used} / ${limit}`;
}

function trial(tenant: PlatformTenantDTO): string {
  const t = tenant.health.trial;
  if (t === null) return "—";
  return t.expired ? "expired" : `${t.daysRemaining}d left`;
}

/**
 * Every workspace on the installation, worst first.
 *
 * Reads `GET /platform/tenants`, which already carries a computed `health` per tenant — this page
 * was a placeholder written before that existed and outlived it.
 */
export default async function HealthPage() {
  const result = await listPlatformTenants();

  if (!result.ok) {
    return (
      <section>
        <h1 className="mb-4 text-lg font-semibold text-charcoal">Health</h1>
        <ErrorState title="Couldn't load tenant health" message={result.failure.message} />
      </section>
    );
  }

  const tenants = [...result.data.tenants].sort(
    (a, b) => RANK[a.health.level] - RANK[b.health.level] || a.name.localeCompare(b.name),
  );
  const counts = {
    critical: tenants.filter((t) => t.health.level === "critical").length,
    warning: tenants.filter((t) => t.health.level === "warning").length,
    ok: tenants.filter((t) => t.health.level === "ok").length,
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-charcoal">Health</h1>
        <p className="text-sm text-gray">
          {tenants.length} workspace{tenants.length === 1 ? "" : "s"} — worst first.
        </p>
      </div>

      {tenants.length === 0 ? (
        <EmptyState
          title="No tenants"
          description="No workspace exists on this installation yet."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-8 rounded-xl border border-black/10 bg-white p-4">
            <DonutChart
              height={150}
              caption="workspaces"
              legend={false}
              slices={LEVELS.filter((level) => counts[level] > 0).map((level) => ({
                key: level,
                label: level,
                value: counts[level],
                color: LEVEL_COLOR[level],
              }))}
            />
            <ul className="flex min-w-56 flex-1 flex-col gap-2.5">
              {LEVELS.map((level) => (
                <li key={level} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: LEVEL_COLOR[level] }}
                  />
                  <span className="w-16 text-sm text-charcoal capitalize">{level}</span>
                  <Meter
                    className="flex-1"
                    value={counts[level]}
                    max={Math.max(1, tenants.length)}
                    tone={
                      level === "critical" ? "danger" : level === "warning" ? "amber" : "success"
                    }
                  />
                  <span className="w-6 text-right text-sm tabular-nums text-gray">
                    {counts[level]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Table
            caption="Tenant health"
            columns={["Workspace", "Health", "Signals", "Seats", "Trial"]}
          >
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-black/5">
                <Td>
                  <Link href={`/tenants/${tenant.slug}`} className="font-medium text-navy">
                    {tenant.name}
                  </Link>
                  <div className="text-xs text-gray">{tenant.slug}</div>
                </Td>
                <Td>
                  <Badge tone={LEVEL_TONE[tenant.health.level]}>{tenant.health.level}</Badge>
                </Td>
                <Td>
                  {tenant.health.signals.length === 0 ? (
                    <span className="text-sm text-gray">—</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {tenant.health.signals.map((signal) => (
                        <li key={signal} className="text-[13px] text-charcoal">
                          {SIGNAL_LABEL[signal]}
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                <Td className="tabular-nums">{seats(tenant)}</Td>
                <Td className="text-sm text-gray">{trial(tenant)}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </section>
  );
}
