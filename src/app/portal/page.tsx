import { redirect } from "next/navigation";
import { resolvePortalContact } from "@/server/auth/portal-guards";
import { clientPortalService } from "@/server/services/client-portal.service";
import { PortalView } from "./portal-view";

export default async function PortalPage() {
  const ctx = await resolvePortalContact();
  if (!ctx) redirect("/portal/request-access?error=invalid_link");

  const data = await clientPortalService.data(ctx);
  await clientPortalService.logView(ctx, "portal");

  return <PortalView initial={data} />;
}
