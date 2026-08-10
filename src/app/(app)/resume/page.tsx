import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { aiEnabled } from "@/server/ai/config";
import { storageEnabled } from "@/server/integrations/storage";
import { ResumeFlow } from "./resume-flow";

/**
 * Parse Resume (Wave 1.2) — server component. Reads the session server-side (auth is never
 * trusted from the client) and passes the `resumeExtractionEnabled`/`resumeStorageEnabled` flags
 * down as props (mirrors `SignInForm googleEnabled`). Reading `@/server/ai/config` and
 * `@/server/integrations/storage` here is allowed: `src/app` may import server modules; the
 * client flow may NOT.
 */
export default async function ResumePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      {/* no-print: when printing the branded resume, only the document itself lands on paper. */}
      <header className="no-print">
        <h1 className="text-2xl font-bold text-navy">Resume Converter</h1>
        <p className="text-sm text-gray">
          Pick the role, upload the resume, get the finished DestaHealth profile.
        </p>
      </header>
      <ResumeFlow
        recruiterName={user.name}
        resumeExtractionEnabled={aiEnabled}
        resumeStorageEnabled={storageEnabled}
      />
    </div>
  );
}
