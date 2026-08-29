import { NotBuiltYet } from "../../../components/not-built-yet";

export const metadata = { title: "Health · Platform Console" };

export default function HealthPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold text-charcoal">Health</h1>
      <NotBuiltYet what="Tenant health" endpoint="a platform health endpoint" />
    </section>
  );
}
