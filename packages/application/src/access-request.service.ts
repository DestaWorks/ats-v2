import { accessRequestRepository } from "@destaworks/db/repositories/access-request.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { adminUserService } from "./admin-user.service";
import { AppError } from "@destaworks/integrations/http/app-error";
import { sendEmail } from "@destaworks/integrations/email/provider";
import { accessApprovedEmail } from "@destaworks/integrations/email/templates/access-approved";
import { toIso } from "@destaworks/domain/utils/iso";
import { defined } from "@destaworks/domain/utils/defined";
import type { AccessRequestInput } from "@destaworks/contracts/validation/auth";
import type {
  AccessRequestDTO,
  GeneratedPasswordDTO,
} from "@destaworks/contracts/validation/admin";
import type { Role } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";

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
  /**
   * Reject a resubmission while an earlier request from this email is still pending, instead of
   * silently piling up duplicate rows (confirmed live 2026-08-11 — the same email submitted the
   * form 4 times, all landing as separate "pending" rows an admin then has to sort through/
   * decline individually). Declined/approved requests don't block a fresh submission — only an
   * unresolved one does.
   *
   * UNSCOPED, and cannot be threaded yet: the form is public, so there is no session, and with no
   * tenant routing on `/request-access` there is no claim to resolve either. Which tenant a
   * pre-signup request belongs to is a Phase 9 onboarding decision, not a codemod.
   */
  async submit(ctx: TenantContext, input: AccessRequestInput) {
    const existing = await accessRequestRepository.findPendingByEmail(ctx, input.email);
    if (existing) {
      throw new AppError(
        "CONFLICT",
        "You already have a pending access request — an admin will review it soon.",
      );
    }
    return accessRequestRepository.create(
      ctx,
      defined({
        name: input.name,
        email: input.email,
        organization: input.organization,
        message: input.message,
      }),
    );
  },

  async list(ctx: TenantContext): Promise<AccessRequestDTO[]> {
    const rows = await accessRequestRepository.list(ctx);
    return rows.map(toDTO);
  },

  /**
   * Creates the account (via `adminUserService.create`, so the SAME hashed-password path as
   * every other new user) THEN flips the request's status — fixing legacy's confirmed bug where
   * `approve_request` has no backend handler at all and status never actually changes.
   *
   * Confirmed live 2026-08-10: a request whose email already has an account (e.g. a stale
   * pending row left behind after an earlier successful approval, or two overlapping requests
   * for the same person) made `adminUserService.create` → Better Auth's `createUser` throw an
   * unmapped `APIError` — not one of our own `AppError`s, so it fell through to the generic
   * catch-all as an opaque 500 instead of a clear message. Pre-check and reject with CONFLICT.
   */
  async approve(ctx: TenantContext, id: string, role: Role): Promise<GeneratedPasswordDTO> {
    const request = await accessRequestRepository.findById(ctx, id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");
    if (request.status !== "pending") {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }
    if (await userRepository.findByEmail(request.email)) {
      throw new AppError("CONFLICT", "An account with this email already exists");
    }
    const created = await adminUserService.create(ctx, {
      name: request.name,
      email: request.email,
      role,
    });
    await accessRequestRepository.updateStatus(ctx, id, "approved");
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

  async decline(ctx: TenantContext, id: string): Promise<void> {
    const request = await accessRequestRepository.findById(ctx, id);
    if (!request) throw new AppError("NOT_FOUND", "Access request not found");
    if (request.status !== "pending") {
      throw new AppError("CONFLICT", "This request has already been resolved");
    }
    await accessRequestRepository.updateStatus(ctx, id, "declined");
  },
};
