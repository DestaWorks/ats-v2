import { redirect } from "next/navigation";

/**
 * Root — there is no standalone landing page. Send everyone to the dashboard; the `(app)` layout
 * guard bounces unauthenticated visitors on to `/sign-in`.
 */
export default function HomePage() {
  redirect("/dashboard");
}
