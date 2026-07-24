"use client";

import { useState } from "react";
import type { AccessRequestDTO, AdminUserDTO } from "@/lib/validation/admin";
import type { PortalAccessRequestDTO } from "@/lib/validation/portal";
import { DetailTabs, type TabDef } from "@/components/ui/tabs";
import { GeneratedPasswordBanner, UsersTab } from "./users-tab";
import { AccessRequestsTab } from "./access-requests-tab";
import { RolesTab } from "./roles-tab";
import { GeneratedPortalLinkBanner, PortalRequestsTab } from "./portal-requests-tab";

export function AdminDashboard({
  initialUsers,
  initialRequests,
  currentUserId,
  canConfigurePortal,
  initialPortalRequests,
  clients,
}: {
  initialUsers: AdminUserDTO[];
  initialRequests: AccessRequestDTO[];
  currentUserId: string;
  canConfigurePortal: boolean;
  initialPortalRequests: PortalAccessRequestDTO[];
  clients: { id: string; name: string }[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [requests, setRequests] = useState(initialRequests);
  const [portalRequests, setPortalRequests] = useState(initialPortalRequests);
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null);
  const [generatedLink, setGeneratedLink] = useState<{ fullName: string; token: string } | null>(
    null,
  );

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
    { key: "roles", label: "Roles", panel: <RolesTab /> },
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
  ];

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Admin</h1>
        <p className="text-sm text-gray">Manage accounts, access requests, and role permissions.</p>
      </header>

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

      <DetailTabs tabs={tabs} ariaLabel="Admin" />
    </div>
  );
}
