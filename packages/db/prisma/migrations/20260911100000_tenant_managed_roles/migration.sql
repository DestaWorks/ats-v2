-- Tenant-managed roles: a role becomes DATA a tenant owns, not a constant in the code.
--
-- Until now `memberships.role` held a string matched against a fixed table in
-- `domain/constants/roles.ts`. That made roles unconfigurable and unsellable: a firm could not
-- name their own tier, could not decide that their screeners may see licence numbers, and every
-- tenant was stuck with six names that mean different things in different companies.
--
-- Each tenant now owns its own rows in `access_roles`, seeded by cloning the six built-in
-- templates. The code constant remains the source of the DEFAULTS and of the capability
-- vocabulary; it is no longer the runtime answer.
--
-- ── Why `memberships.roleId` is NOT NULL ──────────────────────────────────────────────────────
--
-- A membership with no role would have to mean something at every capability check, and the only
-- safe meanings are "deny everything" (an account that silently stops working) or "some default"
-- (an authorization decision made by absence). Requiring the column removes the question. The
-- backfill below is what makes that possible in one migration.
--
-- ── Why the foreign key is composite ──────────────────────────────────────────────────────────
--
-- `(roleId, tenantId)` references `(id, tenantId)`, not `roleId` alone. A membership pointing at
-- another tenant's role is the one cross-tenant mistake this table could make, and referencing
-- both columns together makes it unrepresentable rather than merely checked. That is also why
-- `access_roles` carries a UNIQUE on `(id, tenantId)` that looks redundant beside its primary key.
--
-- ON DELETE RESTRICT because deleting a role out from under the people holding it would strip
-- their access silently; the editor has to reassign them first.

-- 1. The table.
CREATE TABLE "access_roles" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "capabilities" TEXT[],
    "templateKey"  TEXT,
    "isBuiltIn"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "access_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_roles_tenantId_name_key" ON "access_roles" ("tenantId", "name");
CREATE UNIQUE INDEX "access_roles_id_tenantId_key"   ON "access_roles" ("id", "tenantId");

ALTER TABLE "access_roles"
    ADD CONSTRAINT "access_roles_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Seed every existing tenant with the six built-ins.
--
-- The capability arrays are the ones `ROLE_CAPABILITIES` grants today, and
-- `access-role.seed.test.ts` asserts they still match — a drift between this file and the code
-- would hand new tenants a different set from the one every test reasons about.
INSERT INTO "access_roles" ("id", "tenantId", "name", "capabilities", "templateKey", "isBuiltIn", "updatedAt")
SELECT
    'ar_' || substr(md5(t."id" || ':' || tpl."name"), 1, 22),
    t."id",
    tpl."name",
    tpl."capabilities",
    tpl."name",
    true,
    CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (
    VALUES
      ('Owner',     ARRAY['viewCredentials','viewReports','viewAnalytics','bulkImport','viewCrm','viewClientDiscovery','viewAllNoteTypes','manageUsers','manageRoles','manageAccessRequests','configureClientPortal','viewAudit','purgeCandidate','deleteOpenRole','manageAiSettings']::text[]),
      ('Admin',     ARRAY['viewCredentials','viewReports','viewAnalytics','bulkImport','viewCrm','viewClientDiscovery','viewAllNoteTypes','manageUsers','manageRoles','manageAccessRequests','configureClientPortal','viewAudit','purgeCandidate','deleteOpenRole','manageAiSettings']::text[]),
      ('Director',  ARRAY['viewCredentials','viewReports','viewAnalytics','bulkImport','viewCrm','viewClientDiscovery']::text[]),
      ('Manager',   ARRAY['viewReports','viewAnalytics']::text[]),
      ('Screener',  ARRAY['viewCredentials']::text[]),
      ('Associate', ARRAY[]::text[])
) AS tpl("name", "capabilities")
ON CONFLICT ("tenantId", "name") DO NOTHING;

-- 3. Point every membership at its tenant's matching role.
ALTER TABLE "memberships" ADD COLUMN "roleId" TEXT;

UPDATE "memberships" m
SET "roleId" = ar."id"
FROM "access_roles" ar
WHERE ar."tenantId" = m."tenantId" AND ar."name" = m."role";

-- A stored role outside the six — a hand-edited row, or one written before the vocabulary
-- settled — lands on Associate. Least privilege, matching how `toRole` has always treated an
-- unrecognised value: an unknown role must narrow access, never widen it.
UPDATE "memberships" m
SET "roleId" = ar."id"
FROM "access_roles" ar
WHERE m."roleId" IS NULL AND ar."tenantId" = m."tenantId" AND ar."name" = 'Associate';

ALTER TABLE "memberships" ALTER COLUMN "roleId" SET NOT NULL;

CREATE INDEX "memberships_roleId_idx" ON "memberships" ("roleId");

ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_roleId_tenantId_fkey"
    FOREIGN KEY ("roleId", "tenantId") REFERENCES "access_roles" ("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
