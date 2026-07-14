import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { aiEnabled } from "@/server/ai/config";
import { ResumeFlow } from "./resume-flow";

/**
 * Parse Résumé (Wave 1.2) — server component. Reads the session server-side (auth is never
 * trusted from the client) and passes the `resumeExtractionEnabled` flag down as a prop
 * (mirrors `SignInForm googleEnabled`). Reading `@/server/ai/config` here is allowed:
 * `src/app` may import server modules; the client flow may NOT.
 */
export default async function ResumePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      {/* no-print: when printing the branded résumé, only the document itself lands on paper. */}
      <header className="no-print">
        <h1 className="text-2xl font-bold text-navy">Résumé Converter</h1>
        <p className="text-sm text-gray">
          Pick the role, upload the résumé, get the finished DestaHealth profile.
        </p>
      </header>
      <ResumeFlow recruiterName={user.name} resumeExtractionEnabled={aiEnabled} />
    </div>
  );
}
