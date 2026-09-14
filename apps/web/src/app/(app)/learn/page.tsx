import { requirePageUser } from "@/lib/page-user";
import { LEARN_CHAPTERS } from "@destaworks/contracts/validation/learn";
import type { LearnProgressDTO } from "@destaworks/contracts/validation/learn";
import { apiGet } from "@/lib/api/server";
import { LearnView } from "./learn-view";

/**
 * Learn tutorial (RSC, Wave 5.4, legacy `index.html:5201-5275`) — 8 chapters, "Try it" deep
 * links, and real per-user progress (`User.learnProgress`, not legacy's unscoped localStorage).
 */
export default async function LearnPage() {
  await requirePageUser();

  const progress = await apiGet<LearnProgressDTO>("/me/learn-progress");

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <LearnView chapters={LEARN_CHAPTERS} initialProgress={progress} />
    </div>
  );
}
