import Link from "next/link";
import type { TenantHealthLevel } from "@destaworks/contracts/validation/tenant";
import { Badge, type BadgeTone } from "@destaworks/ui/badge";
import { Card } from "@destaworks/ui/card";
import { ErrorState } from "@destaworks/ui/error-state";
import { readPlatformTenant } from "../../../../lib/platform-api";
import { SuspensionPanel } from "./suspension-panel";

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  trial: "navy",
  suspended: "danger",
};

const HEALTH_TONE: Record<TenantHealthLevel, BadgeTone> = {
  ok: "success",
  warning: "amber",
  critical: "danger",
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray uppercase">{label}</dt>
      <dd className="mt-1 text-charcoal">{children}</dd>
    </div>
  );
}

export default async function TenantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readPlatformTenant(slug);

  if (!result.ok) {
    return (
      <section>
        <Link href="/tenants" className="text-xs font-medium text-navy">
          ← All tenants
        </Link>
        <ErrorState
          className="mt-4"
          title="Couldn't load this workspace"
          message={result.failure.message}
        />
      </section>
    );
  }

  const tenant = result.data.tenant;
  const { health } = tenant;

  return (
    <section>
      <Link href="/tenants" className="text-xs font-medium text-navy">
        ← All tenants
      </Link>

      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-charcoal">{tenant.name}</h1>
        <Badge tone={STATUS_TONE[tenant.status] ?? "neutral"}>{tenant.status}</Badge>
        <Badge tone={HEALTH_TONE[health.level]}>{health.level}</Badge>
      </div>

      <Card className="px-5 py-4">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Fact label="Slug">{tenant.slug}</Fact>
          <Fact label="Plan">{tenant.plan}</Fact>
          <Fact label="Members">
            <span className="tabular-nums">
              {health.seats.limit === null
                ? tenant.memberCount
                : `${health.seats.used} / ${health.seats.limit}`}
            </span>
          </Fact>
          <Fact label="Created">{new Date(tenant.createdAt).toLocaleDateString()}</Fact>
          <Fact label="Trial">
            {health.trial === null
              ? "—"
              : health.trial.expired
                ? "expired"
                : `${health.trial.daysRemaining}d left`}
          </Fact>
          <Fact label="Last activity">
            {tenant.lastActivityAt === null
              ? "never"
              : new Date(tenant.lastActivityAt).toLocaleString()}
          </Fact>
          <Fact label="Tenant id">
            <span className="font-mono text-xs text-gray">{tenant.id}</span>
          </Fact>
        </dl>

        {health.signals.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-black/5 pt-3">
            {health.signals.map((signal) => (
              <Badge key={signal} tone={HEALTH_TONE[health.level]}>
                {signal}
              </Badge>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="mt-6">
        <SuspensionPanel slug={tenant.slug} suspended={tenant.status === "suspended"} />
      </div>
    </section>
  );
}
