import "server-only";
import { accessRequestRepository } from "@/server/repositories/access-request.repository";
import type { AccessRequestInput } from "@/lib/validation/auth";

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
};
