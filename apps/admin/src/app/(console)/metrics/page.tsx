import { NotBuiltYet } from "../../../components/not-built-yet";

export const metadata = { title: "Platform metrics · Platform Console" };

/**
 * Platform metrics are separate from any tenant's reports (SAAS-RESTRUCTURE-PLAN Phase 8): they
 * describe the installation, so they must never be assembled from a tenant's report endpoints.
 */
export default function MetricsPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold text-charcoal">Platform metrics</h1>
      <NotBuiltYet what="Platform metrics" endpoint="a platform metrics endpoint" />
    </section>
  );
}
