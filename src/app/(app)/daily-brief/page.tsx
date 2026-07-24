import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { DailyBriefView } from "./daily-brief-view";

/**
 * Daily Brief (Wave 5.1, legacy `vw="brief"`). Thin auth shell — "today" is the user-local date,
 * so the composite loads client-side.
 */
export default async function DailyBriefPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Daily Brief</h1>
        <p className="mt-1 text-sm text-gray">
          Generate today&apos;s operational summary from live pipeline data.
        </p>
      </header>
      <DailyBriefView />
    </div>
  );
}
