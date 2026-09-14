/**
 * Client note contract (Wave 4.2, Health Score slice, CRM) — a manual call/note log entry
 * (legacy `crm_note`). Pure (NO server imports).
 */
import { z } from "zod";

export interface ClientNoteDTO {
  id: string;
  clientId: string;
  text: string;
  loggedById: string | null;
  loggedByName: string | null;
  createdAt: string; // ISO
}

export const createClientNoteSchema = z
  .object({ text: z.string().trim().min(1).max(4000) })
  .strict();
export type CreateClientNoteInput = z.infer<typeof createClientNoteSchema>;
