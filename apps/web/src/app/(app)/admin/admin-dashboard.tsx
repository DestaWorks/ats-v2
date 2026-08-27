"use client";

import { useState } from "react";
import { ROLES } from "@destaworks/domain/constants";
import type { AccessRequestDTO, AdminUserDTO } from "@destaworks/contracts/validation/admin";
import type { PortalAccessRequestDTO } from "@destaworks/contracts/validation/portal";
import type { AiSettingsDTO, AiUsageOverviewDTO } from "@destaworks/contracts/validation/ai-ops";
import { cn } from "@destaworks/domain/utils/cn";
import { DetailTabs, type TabDef } from "@destaworks/ui/tabs";
import { GeneratedPasswordBanner, UsersTab } from "./users-tab";
import { AccessRequestsTab } from "./access-requests-tab";
import { RolesTab } from "./roles-tab";
import { GeneratedPortalLinkBanner, PortalRequestsTab } from "./portal-requests-tab";
import { AiOpsTab } from "./ai-ops-tab";

/** One clickable summary tile — legacy `AdminView`'s stat-card row parity. Colored only when its
 *  count is worth calling out (Pending/Blocked > 0); a zero count reads as neutral gray. */
function StatCard({
  count,
  label,
  tone,
  onClick,
}: {
  count: number;
  label: string;
  tone: "navy" | "orange" | "red" | "purple" | "neutral";
  onClick: () => void;
}) {
  const TONE = {
    navy: "bg-navy/10 text-navy",
    orange: "bg-orange/10 text-orange",
    red: "bg-red/10 text-red",
    purple: "bg-purple/10 text-purple",
    neutral: "bg-black/[0.03] text-gray",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-3 py-2.5 transition hover:opacity-80",
        TONE[tone],
      )}
    >
      <span className="font-serif text-xl font-bold">{count}</span>
      <span className="text-[10px] font-semibold tracking-wide uppercase opacity-70">{label}</span>
    </button>
  );
}

export function AdminDashboard({
  initialUsers,
  initialRequests,
  currentUserId,
  canConfigurePortal,
  initialPortalRequests,
  clients,
  canManageAi,
  initialAiSettings,
  aiUsage,
}: {
  initialUsers: AdminUserDTO[];
  initialRequests: AccessRequestDTO[];
  currentUserId: string;
  canConfigurePortal: boolean;
  initialPortalRequests: PortalAccessRequestDTO[];
  clients: { id: string; name: string }[];
  canManageAi: boolean;
  initialAiSettings: AiSettingsDTO;
  aiUsage: AiUsageOverviewDTO;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [requests, setRequests] = useState(initialRequests);
  const [portalRequests, setPortalRequests] = useState(initialPortalRequests);
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null);
  const [generatedLink, setGeneratedLink] = useState<{ fullName: string; token: string } | null>(
    null,
  );
  // Which tab a stat card should jump to on click. `DetailTabs` only supports an `initialKey`
  // (uncontrolled after mount), so remounting it with a changed `key` is how the jump works.
  const [jumpTo, setJumpTo] = useState<string | undefined>(undefined);

  function upsertUser(user: AdminUserDTO) {
    const exists = users.some((u) => u.id === user.id);
    setUsers((prev) => (exists ? prev.map((u) => (u.id === user.id ? user : u)) : [user, ...prev]));
  }

  function announcePassword(email: string, result: { generatedPassword: string | null }) {
    if (result.generatedPassword) setGenerated({ email, password: result.generatedPassword });
  }

  const blocked = users.filter((u) => u.banned);
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const resolvedRequests = requests.filter((r) => r.status !== "pending");
  const pendingPortalRequests = portalRequests.filter((r) => r.status === "pending");
  const resolvedPortalRequests = portalRequests.filter((r) => r.status !== "pending");

  const tabs: TabDef[] = [
    {
      key: "users",
      label: `Users (${users.length})`,
      panel: (
        <UsersTab
          users={users}
          currentUserId={currentUserId}
          onChanged={upsertUser}
          onRemoved={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
          onPassword={announcePassword}
        />
      ),
    },
    {
      key: "requests",
      label: `Access Requests (${pendingRequests.length})`,
      panel: (
        <AccessRequestsTab
          pending={pendingRequests}
          resolved={resolvedRequests}
          onResolved={(req) => setRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)))}
          onPassword={announcePassword}
        />
      ),
    },
    { key: "roles", label: "Roles", panel: <RolesTab users={users} /> },
    {
      key: "blocked",
      label: `Blocked (${blocked.length})`,
      panel: (
        <UsersTab
          users={blocked}
          currentUserId={currentUserId}
          onChanged={upsertUser}
          onRemoved={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
          onPassword={announcePassword}
          emptyMessage="No accounts are currently blocked."
        />
      ),
    },
    ...(canConfigurePortal
      ? [
          {
            key: "portal-requests",
            label: `Portal Requests (${pendingPortalRequests.length})`,
            panel: (
              <PortalRequestsTab
                pending={pendingPortalRequests}
                resolved={resolvedPortalRequests}
                clients={clients}
                onResolved={(req) =>
                  setPortalRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)))
                }
                onLinkGenerated={setGeneratedLink}
              />
            ),
          },
        ]
      : []),
    ...(canManageAi
      ? [
          {
            key: "ai-ops",
            label: "AI Ops",
            panel: <AiOpsTab initialSettings={initialAiSettings} usage={aiUsage} />,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Admin</h1>
        <p className="text-sm text-gray">Manage accounts, access requests, and role permissions.</p>
      </header>

      <div className="grid grid-cols-4 gap-2">
        <StatCard
          count={users.length}
          label="Total Users"
          tone="navy"
          onClick={() => setJumpTo("users")}
        />
        <StatCard
          count={pendingRequests.length}
          label="Pending"
          tone={pendingRequests.length > 0 ? "orange" : "neutral"}
          onClick={() => setJumpTo("requests")}
        />
        <StatCard
          count={blocked.length}
          label="Blocked"
          tone={blocked.length > 0 ? "red" : "neutral"}
          onClick={() => setJumpTo("blocked")}
        />
        <StatCard
          count={ROLES.length}
          label="Roles"
          tone="purple"
          onClick={() => setJumpTo("roles")}
        />
      </div>

      {generated ? (
        <GeneratedPasswordBanner
          email={generated.email}
          password={generated.password}
          onDismiss={() => setGenerated(null)}
        />
      ) : null}
      {generatedLink ? (
        <GeneratedPortalLinkBanner
          fullName={generatedLink.fullName}
          token={generatedLink.token}
          onDismiss={() => setGeneratedLink(null)}
        />
      ) : null}

      <DetailTabs
        key={jumpTo}
        tabs={tabs}
        {...(jumpTo !== undefined && { initialKey: jumpTo })}
        ariaLabel="Admin"
      />
    </div>
  );
}
