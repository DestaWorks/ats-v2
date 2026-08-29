import { redirect } from "next/navigation";
import { resolvePortalContact } from "@destaworks/auth/portal-guards";
import type {
  GetPortalDataResponse,
  PostPortalLogViewResponse,
} from "@destaworks/contracts/validation/portal";
import { apiGet, apiPost } from "@/lib/api/server";
import { PortalView } from "./portal-view";

export default async function PortalPage() {
  const ctx = await resolvePortalContact();
  if (!ctx) redirect("/portal/request-access?error=invalid_link");

  const data = await apiGet<GetPortalDataResponse>("/portal/data");
  await apiPost<PostPortalLogViewResponse>("/portal/log-view", { page: "portal" });

  return <PortalView initial={data} />;
}
