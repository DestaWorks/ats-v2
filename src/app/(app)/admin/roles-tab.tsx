import { CAPABILITIES, ROLES, ROLE_CAPABILITIES, type Role } from "@/lib/constants";
import type { AdminUserDTO } from "@/lib/validation/admin";
import { Td } from "@/components/ui/table";

/** Legacy `AdminView`'s `ROLE_COLORS` parity, remapped onto this app's own general-purpose color
 *  tokens (not the candidate-status palette, which is semantically reserved for pipeline stages).
 *  Owner/Admin share every capability (`ROLE_CAPABILITIES`) but stay visually distinct — they're
 *  still separate account types. */
const ROLE_COLOR: Record<Role, string> = {
  Owner: "brand",
  Admin: "teal",
  Director: "navy",
  Manager: "purple",
  Screener: "orange",
  Associate: "gray",
};

/** One line describing what tier of access the role actually grants — grounded in
 *  `ROLE_CAPABILITIES`, not aspirational copy (Owner/Admin and Director/Manager are genuinely
 *  identical in capability today; this says so rather than inventing a false distinction). */
const ROLE_DESCRIPTION: Record<Role, string> = {
  Owner: "Full administrative access — manage users, roles, and every leadership capability.",
  Admin: "Same permissions as Owner — full administrative access to users, roles, and reports.",
  Director:
    "Leadership visibility — reports, analytics, CRM, credentials, and Client Discovery. No user/role management.",
  Manager:
    "Leadership visibility — reports, analytics, CRM, credentials, and Client Discovery. No user/role management.",
  Screener: "Core recruiting access to the pipeline and daily tools. No leadership capabilities.",
  Associate: "Core recruiting access to the pipeline and daily tools. No leadership capabilities.",
};

/** Small circular avatar — the real uploaded photo when present (Wave 6), matching the header
 *  avatar's treatment (`user-menu.tsx`), falling back to an initial otherwise. */
function Avatar({ name, image }: { name: string; image: string | null }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a user-uploaded Storage URL, not a static asset
      <img
        src={image}
        alt=""
        title={name}
        className="h-6 w-6 shrink-0 rounded-full object-cover ring-2 ring-white"
      />
    );
  }
  return (
    <span
      title={name}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy/10 text-[11px] font-bold text-navy ring-2 ring-white"
    >
      {initial}
    </span>
  );
}

const MAX_AVATARS = 5;

function RoleCard({ role, members }: { role: Role; members: AdminUserDTO[] }) {
  const color = ROLE_COLOR[role];
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-black/[0.06] py-2.5 pr-3 pl-3"
      style={{ borderLeft: `4px solid var(--color-${color})` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: `var(--color-${color})` }}
          >
            {role}
          </span>
          <span className="text-[11px] font-semibold text-charcoal">
            {members.length} user{members.length !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-gray">{ROLE_DESCRIPTION[role]}</p>
      </div>
      {members.length > 0 ? (
        <div className="flex -space-x-1.5">
          {members.slice(0, MAX_AVATARS).map((m) => (
            <Avatar key={m.id} name={m.name || m.email} image={m.image} />
          ))}
          {members.length > MAX_AVATARS ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] font-semibold text-gray ring-2 ring-white">
              +{members.length - MAX_AVATARS}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Role management (description + who's in each role) + the read-only permission matrix. */
export function RolesTab({ users }: { users: AdminUserDTO[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2.5 text-sm font-bold tracking-wide text-navy uppercase">
          Role Management
        </h3>
        <div className="flex flex-col gap-1.5">
          {ROLES.map((role) => (
            <RoleCard key={role} role={role} members={users.filter((u) => u.role === role)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-sm font-bold tracking-wide text-navy uppercase">
          Permission Matrix
        </h3>
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-card">
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
      </div>
    </div>
  );
}
