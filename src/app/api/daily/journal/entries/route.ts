import { journalEntrySchema, type JournalEntryDTO } from "@/lib/validation/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

/** Response body of `POST /api/daily/journal/entries`. */
export type PostDailyJournalEntriesResponse = { entry: JournalEntryDTO };

/** POST /api/daily/journal/entries — add a journal note for the SESSION user. */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = journalEntrySchema.parse(await req.json());
  return json<PostDailyJournalEntriesResponse>(
    { entry: await dailyService.addEntry(input.date, input.text, user) },
    201,
  );
});
