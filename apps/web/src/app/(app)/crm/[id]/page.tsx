import { notFound } from "next/navigation";
import { hasCapability } from "@destaworks/domain/constants";
import { requirePageUser } from "@/lib/page-user";
import type { GetCrmClientResponse } from "@destaworks/contracts/http/crm";
import { AppError } from "@destaworks/integrations/http/app-error";
import { ErrorState } from "@destaworks/ui/error-state";
import { apiGet } from "@/lib/api/server";
import { ClientDetail } from "./client-detail";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();

  if (!hasCapability(user.role, "viewCrm")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="CRM is limited to leadership roles. Ask an Owner, Director, Manager, or Admin for client account details."
        />
      </div>
    );
  }

  const { id } = await params;
  let detail;
  try {
    detail = await apiGet<GetCrmClientResponse>(`/crm/clients/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <ClientDetail
      initial={detail}
      canConfigurePortal={hasCapability(user.role, "configureClientPortal")}
    />
  );
}
