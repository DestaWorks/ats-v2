import "server-only";
import { accessRequestRepository } from "@/server/repositories/access-request.repository";
import { adminUserService } from "@/server/services/admin-user.service";
import { AppError } from "@/server/http/app-error";
import { sendEmail } from "@/server/email/provider";
import { accessApprovedEmail } from "@/server/email/templates/access-approved";
import { toIso } from "@/lib/utils/iso";
import type { AccessRequestInput } from "@/lib/validation/auth";
import type { AccessRequestDTO, GeneratedPasswordDTO } from "@/lib/validation/admin";
import type { Role } from "@/lib/constants";

function toDTO(row: {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  message: string | null;
  status: string;
  createdAt: Date;
}): AccessRequestDTO {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization,
    message: row.message,
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}

/**
 * Access-request business logic. Services orchestrate repositories and own rules/authz;
 * they never import Prisma directly.
 */
export const accessRequestService = {
  submit(input: AccessRequestInput) {
    return accessRequestRepository.create({
      name: input.name,
      email: input.email,
      organization: input.organization,
      message: input.message,
    });
  },

  async list(): Promise<AccessRequestDTO[]> {
    const rows = await accessRequestRepository.list();
    return rows.map(toDTO);
  },

  /**
   * Creates the account (via `adminUserService.create`, so the SAME hashed-password path as
   * every other new user) THEN flips the request's status — fixing legacy's confirmed bug where
   * `approve_request` has no backend handler at all and status never actually changes.
   */
  async approve(id: string, role: Role): Promise<GeneratedPasswordDTO> {
    const request = await accessRequestRepository.findById(id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");
    if (request.status !== "pending") {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }
    const created = await adminUserService.create({
      name: request.name,
      email: request.email,
      role,
    });
    await accessRequestRepository.updateStatus(id, "approved");
    // Best-effort: the account is already created and the request already resolved by this
    // point, so a failed/unconfigured send shouldn't turn into a false "approval failed" error
    // for the admin (who'd then retry into a CONFLICT on an already-approved request). The
    // generated password still surfaces in the admin UI as a fallback if the email never lands.
    if (created.generatedPassword) {
      const signInUrl = new URL(
        "/sign-in",
        process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      ).toString();
      const { subject, html, text } = accessApprovedEmail({
        name: request.name,
        email: request.email,
        temporaryPassword: created.generatedPassword,
        signInUrl,
      });
      await sendEmail({ to: request.email, subject, html, text }).catch(() => undefined);
    }
    return created;
  },

  async decline(id: string): Promise<void> {
    const request = await accessRequestRepository.findById(id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");
    if (request.status !== "pending") {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }
    await accessRequestRepository.updateStatus(id, "declined");
  },
};
