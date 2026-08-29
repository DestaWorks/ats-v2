import { SetMetadata, type CustomDecorator } from "@nestjs/common";
import {
  UNATTRIBUTED_MUTATION_METADATA,
  type UnattributedAllowance,
} from "../interceptors/audit-actor.interceptor";

/**
 * Declare that one mutating route legitimately runs with no signed-in operator, so
 * `AuditActorInterceptor` admits it instead of failing it closed.
 *
 * The reason is required and sits on the route, which is the difference between an exemption and
 * a switch: turning the check off for a host would take it off every route at once.
 */
export const UnattributedMutation = (allowance: UnattributedAllowance): CustomDecorator<string> =>
  SetMetadata(UNATTRIBUTED_MUTATION_METADATA, allowance);
