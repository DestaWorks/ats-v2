import { z } from "zod";
import { NEXT_ACTION_TYPES } from "@destaworks/domain/rules/next-actions";

/** `GET /candidates/:id/outreach/message` — which action the message is answering. */
export const outreachMessageQuerySchema = z.object({ type: z.enum(NEXT_ACTION_TYPES) }).strict();
export type OutreachMessageQuery = z.infer<typeof outreachMessageQuerySchema>;

/**
 * One ready-to-send message, built from a house template.
 *
 * Composed server-side rather than in the browser because the recipient has to be resolved from
 * the record: a NUDGE goes to the CLIENT (we are chasing their response) and a re-engagement goes
 * to the CANDIDATE. Getting that backwards would send a candidate the note about themselves.
 */
export interface OutreachMessageDTO {
  /** Who this is addressed to — resolved from the record, never supplied by the caller. */
  to: string | null;
  /** `client` or `candidate`, so the UI can say who is about to receive it. */
  audience: string;
  subject: string;
  body: string;
  /** The house template used, so a send records which one it was. */
  templateId: string;
  templateName: string;
}
