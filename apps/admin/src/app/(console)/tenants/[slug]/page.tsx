import Link from "next/link";
import { Badge } from "@destaworks/ui/badge";
import { Card } from "@destaworks/ui/card";
import { ErrorState } from "@destaworks/ui/error-state";
import { NotBuiltYet } from "../../../../components/not-built-yet";
import { readPlatformTenant } from "../../../../lib/platform-api";

export default async function TenantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readPlatformTenant(slug);

  return (
    <section>
      <Link href="/tenants" className="text-xs font-medium text-navy">
        ← All tenants
      </Link>

      {!result.ok ? (
        <ErrorState
          className="mt-4"
          title="Couldn't load this workspace"
          message={result.failure.message}
        />
      ) : (
        <>
          <h1 className="mt-2 mb-4 text-lg font-semibold text-charcoal">
            {result.data.tenant.name}
          </h1>
          <Card className="px-5 py-4">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray uppercase">Slug</dt>
                <dd className="mt-1 text-charcoal">{result.data.tenant.slug}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray uppercase">Status</dt>
                <dd className="mt-1">
                  <Badge>{result.data.tenant.status}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray uppercase">Members</dt>
                <dd className="mt-1 text-charcoal tabular-nums">
                  {result.data.tenant.memberCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray uppercase">Tenant id</dt>
                <dd className="mt-1 font-mono text-xs text-gray">{result.data.tenant.id}</dd>
              </div>
            </dl>
          </Card>
        </>
      )}

      <div className="mt-6">
        <NotBuiltYet what="Suspend and restore" endpoint="a platform tenant mutation endpoint" />
      </div>
    </section>
  );
}
