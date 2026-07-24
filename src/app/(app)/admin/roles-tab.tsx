import { CAPABILITIES, ROLES, ROLE_CAPABILITIES } from "@/lib/constants";
import { Td } from "@/components/ui/table";

/** Read-only permission matrix — static, no fetch/mutation. */
export function RolesTab() {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-navy">
            <th scope="col" className="px-3 py-2.5 text-[13px] font-semibold text-white">
              Capability
            </th>
            {ROLES.map((r) => (
              <th
                key={r}
                scope="col"
                className="px-3 py-2.5 text-center text-[13px] font-semibold text-white"
              >
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {CAPABILITIES.map((cap) => (
            <tr key={cap} className="hover:bg-black/[0.02]">
              <Td className="font-medium text-charcoal">{cap}</Td>
              {ROLES.map((r) => (
                <Td key={r} className="text-center">
                  {ROLE_CAPABILITIES[r].includes(cap) ? (
                    <span aria-label="Granted" className="text-green">
                      ✓
                    </span>
                  ) : (
                    <span aria-label="Not granted" className="text-black/15">
                      —
                    </span>
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
