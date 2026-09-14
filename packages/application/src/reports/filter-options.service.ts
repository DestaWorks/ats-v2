import type { TenantContext } from "@destaworks/domain/tenant";
import { CREDENTIALS, SOURCES } from "@destaworks/domain/constants";
import type { ReportFilterOptionsDTO } from "@destaworks/contracts/reports/filter-options";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";

/** Dropdown options for the `/reports` and `/analytics` filter bars — loaded once by the RSC page. */
export const reportFilterOptionsService = {
  async load(ctx: TenantContext): Promise<ReportFilterOptionsDTO> {
    const [clients, users] = await Promise.all([
      clientRepository.list(ctx),
      userRepository.listByTenant(ctx.tenantId),
    ]);
    return {
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
      users: users.map((u) => ({ id: u.id, name: u.name })),
      sources: SOURCES,
      credentials: CREDENTIALS,
    };
  },
};
