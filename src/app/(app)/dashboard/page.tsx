import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { hasCapability } from "@/lib/constants";
import { SignOutButton } from "./sign-out-button";

/**
 * Protected route — proves server-side auth + capability gating. Reads the session on
 * the server (role comes from the DB, never the client) and gates content by capability.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const canViewReports = hasCapability(user.role, "viewReports");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
          <p className="text-sm text-gray">
            {user.name} · <span className="font-semibold text-charcoal">{user.role}</span>
          </p>
        </div>
        <SignOutButton />
      </header>

      <section className="rounded-xl border border-black/5 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-navy uppercase">Capability check</h2>
        <p className="mt-2 text-sm text-charcoal">
          Reports (leadership capability):{" "}
          {canViewReports ? (
            <span className="font-semibold text-green">visible for your role</span>
          ) : (
            <span className="font-semibold text-gray">hidden for your role</span>
          )}
        </p>
        <p className="mt-2 text-xs text-gray">
          UI hiding is UX only — the same check is enforced server-side by
          <code className="mx-1 rounded bg-label px-1 text-navy">requireCapability</code>
          on every guarded route/endpoint.
        </p>
      </section>
    </main>
  );
}
