import { redirect, notFound } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { clientService } from "@/server/services/client.service";
import { AppError } from "@/server/http/app-error";
import { ErrorState } from "@/components/ui/error-state";
import { ClientDetail } from "./client-detail";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

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
    detail = await clientService.detail(id);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return <ClientDetail initial={detail} />;
}
