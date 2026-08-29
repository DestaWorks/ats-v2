import { NotBuiltYet } from "../../../components/not-built-yet";

export const metadata = { title: "Support access · Platform Console" };

/**
 * Support impersonation is time-boxed, audited and consented (SAAS-RESTRUCTURE-PLAN Phase 8).
 * All three are properties of the grant the API issues, so this page stays empty until that
 * endpoint exists — a console-side session would be an unaudited crossing.
 */
export default function ImpersonationPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold text-charcoal">Support access</h1>
      <NotBuiltYet what="Support impersonation" endpoint="a platform impersonation endpoint" />
    </section>
  );
}
