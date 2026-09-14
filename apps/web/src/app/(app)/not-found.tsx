import Link from "next/link";
import { EmptyState } from "@destaworks/ui/empty-state";
import { buttonClasses } from "@destaworks/ui/button";

/**
 * Rendered inside the app shell when a page calls `notFound()` — a 404 from `apps/api` for a
 * candidate, client or role id.
 *
 * The wording deliberately does not distinguish "no such record" from "not yours": under
 * multi-tenancy the API answers both with 404 on purpose, and a friendlier message here would
 * hand back the existence check the API refuses to give.
 */
export default function AppSectionNotFound() {
  return (
    <div className="px-8 py-6">
      <EmptyState
        title="We couldn't find that"
        description="It may have been deleted, moved to Trash, or it isn't something this account can open."
        action={
          <Link href="/dashboard" className={buttonClasses("primary", "sm")}>
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
