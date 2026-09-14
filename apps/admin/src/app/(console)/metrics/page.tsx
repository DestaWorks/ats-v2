import type { PlatformMetricsDTO } from "@destaworks/contracts/validation/platform-metrics";
import { ErrorState } from "@destaworks/ui/error-state";
import { Table, Td } from "@destaworks/ui/table";
import { DonutChart } from "@destaworks/ui/donut-chart";
import { Meter } from "@destaworks/ui/meter";
import { TrendChart } from "@destaworks/ui/trend-chart";
import { readPlatformMetrics } from "../../../lib/platform-api";

export const metadata = { title: "Platform metrics · Platform Console" };

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-black/10 bg-white p-4 ${className}`}>
      <h2 className="mb-3 text-[11px] font-semibold tracking-wide text-gray uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** A number that is genuinely zero reads as "—", so a real zero is not mistaken for a broken tile. */
function Figure({ value, unit }: { value: number; unit?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold tabular-nums text-charcoal">
        {value === 0 ? "—" : value.toLocaleString()}
      </span>
      {unit && value !== 0 ? <span className="text-xs text-gray">{unit}</span> : null}
    </div>
  );
}

function Unreadable() {
  return (
    <p className="text-sm text-gray">
      Not readable — this account may list workspaces but not read inside them.
    </p>
  );
}

function signupTotal(m: PlatformMetricsDTO): number {
  return m.signups.reduce((sum, p) => sum + p.tenants, 0);
}

export default async function MetricsPage() {
  const result = await readPlatformMetrics();

  if (!result.ok) {
    return (
      <section>
        <h1 className="mb-4 text-lg font-semibold text-charcoal">Platform metrics</h1>
        <ErrorState title="Couldn't load platform metrics" message={result.failure.message} />
      </section>
    );
  }

  const m = result.data.metrics;
  const capped = m.tenants.total - m.seats.tenantsWithoutSeatLimit;
  const megabytes = m.storage === null ? 0 : Math.round(m.storage.knownBytes / 1_000_000);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-charcoal">Platform metrics</h1>
        <p className="text-sm text-gray">
          Last {m.window.days} days · {m.coverage.tenantsScanned} of {m.coverage.tenantsTotal}{" "}
          workspaces scanned
          {m.coverage.truncated ? " · truncated" : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Workspaces" className="lg:col-span-2">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-4xl font-bold tabular-nums text-charcoal">{m.tenants.total}</div>
              <p className="mt-1 text-sm text-gray">
                {signupTotal(m) === 0
                  ? `No new workspaces in ${m.window.days} days`
                  : `+${signupTotal(m)} in the last ${m.window.days} days`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-gray">
                {m.activity.activeTenants} of {m.activity.liveTenants} active
              </span>
              <div className="w-28">
                <Meter value={m.activity.activeTenants} max={Math.max(1, m.activity.liveTenants)} />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <TrendChart
              valueLabel="New workspaces"
              points={m.signups.map((p) => ({ label: p.day.slice(5), value: p.tenants }))}
            />
          </div>
        </Panel>

        <Panel title="Plan mix">
          <div className="flex items-center">
            <DonutChart
              height={140}
              caption="workspaces"
              slices={m.tenants.byPlan.map((b) => ({
                key: b.key,
                label: b.key,
                value: b.count,
              }))}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Seats">
          <Figure value={m.seats.seatsUsed} unit="in use" />
          {capped > 0 ? (
            <>
              <div className="mt-2">
                <Meter
                  value={m.seats.seatsUsed}
                  max={Math.max(1, m.seats.seatsLicensed)}
                  tone={m.seats.seatsUsed > m.seats.seatsLicensed ? "amber" : "navy"}
                />
              </div>
              <p className="mt-1.5 text-xs text-gray">
                {m.seats.seatsLicensed} licensed across {capped} capped workspace
                {capped === 1 ? "" : "s"}
                {m.seats.tenantsWithoutSeatLimit > 0
                  ? ` · ${m.seats.tenantsWithoutSeatLimit} uncapped`
                  : ""}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-xs text-gray">
              No workspace has a seat limit, so nothing is licensed against.
            </p>
          )}
        </Panel>

        <Panel title="Status">
          <ul className="flex flex-col gap-2">
            {m.tenants.byStatus.length === 0 ? (
              <li className="text-sm text-gray">No workspaces</li>
            ) : (
              m.tenants.byStatus.map((bucket) => (
                <li key={bucket.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-charcoal">{bucket.key}</span>
                    <span className="tabular-nums text-gray">{bucket.count}</span>
                  </div>
                  <Meter value={bucket.count} max={Math.max(1, m.tenants.total)} />
                </li>
              ))
            )}
          </ul>
        </Panel>

        <Panel title={`Scheduled jobs · ${m.window.days}d`}>
          <Figure value={m.jobs.runsInWindow} unit="runs" />
          <p className="mt-1.5 text-xs text-gray">
            {m.jobs.schedules.length === 0
              ? "No scheduled run has been claimed in this window."
              : `${m.jobs.schedules.length} schedule${m.jobs.schedules.length === 1 ? "" : "s"} reporting`}
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="AI usage">
          {m.aiUsage === null ? (
            <Unreadable />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Figure value={m.aiUsage.calls} />
                <span className="text-xs text-gray">calls</span>
              </div>
              <div>
                <Figure value={m.aiUsage.errors} />
                <span className="text-xs text-gray">errors</span>
              </div>
              <div>
                <Figure value={m.aiUsage.inputTokens + m.aiUsage.outputTokens} />
                <span className="text-xs text-gray">tokens</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Storage">
          {m.storage === null ? (
            <Unreadable />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Figure value={m.storage.documents} />
                <span className="text-xs text-gray">documents</span>
              </div>
              <div>
                <Figure value={megabytes} />
                <span className="text-xs text-gray">MB known</span>
              </div>
              <div>
                <Figure value={m.storage.documentsOfUnknownSize} />
                <span className="text-xs text-gray">unsized</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {m.jobs.schedules.length > 0 ? (
        <Table caption="Scheduled jobs" columns={["Schedule", "Runs", "Last occurrence"]}>
          {m.jobs.schedules.map((s) => (
            <tr key={s.schedule} className="border-t border-black/5">
              <Td className="font-medium text-charcoal">{s.schedule}</Td>
              <Td className="tabular-nums">{s.runs}</Td>
              <Td className="text-gray">
                {s.lastOccurrenceAt === null ? "—" : new Date(s.lastOccurrenceAt).toLocaleString()}
              </Td>
            </tr>
          ))}
        </Table>
      ) : null}
    </section>
  );
}
