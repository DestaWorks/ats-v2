#!/usr/bin/env bash
# Runs the E2E suite against a throwaway Postgres, the same way CI does.
set -euo pipefail

CONTAINER=desta-ats-e2e-postgres
DB=destaworks_e2e

find_free_port() {
  python3 - <<'PYEOF'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PYEOF
}
PORT="${E2E_DB_PORT:-$(find_free_port)}"
URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}"

db_host="$(printf '%s' "${DATABASE_URL:-}" | sed -E 's#^[^:]+://([^@]*@)?([^:/?]+).*#\2#')"
case "$db_host" in
  ""|localhost|127.0.0.1|::1|0.0.0.0|host.docker.internal) ;;
  *) echo "refusing: DATABASE_URL points at a non-local host '${db_host}'" >&2; exit 2 ;;
esac

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 2; }

export E2E_STRICT_SERVERS=1
for port in 3004 3007 "${ADMIN_PORT:-3008}"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "" >&2
    echo "  Port ${port} is already in use." >&2
    echo "" >&2
    echo "  The suite needs to start its own servers against the throwaway database." >&2
    echo "  Whatever is on that port points somewhere else." >&2
    echo "" >&2
    echo "  If it is the local container stack:  docker stop desta-ats-web-1 desta-ats-api-1" >&2
    echo "" >&2
    exit 2
  fi
done

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> starting a throwaway Postgres on :${PORT}"
cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB="$DB" \
  -p "127.0.0.1:${PORT}:5432" \
  postgres:16 >/dev/null

echo "==> waiting for it to accept connections"
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 || {
  echo "postgres did not become ready" >&2; exit 1;
}

export DATABASE_URL="$URL"
export DIRECT_URL="$URL"
export BETTER_AUTH_URL=http://localhost:3007
export BETTER_AUTH_SECRET=e2e-local-only-not-a-real-secret-000000
export API_URL=http://localhost:3004
export NEXT_PUBLIC_API_URL=http://localhost:3004
export WEB_ORIGINS=http://localhost:3007
export PLATFORM_API_URL=http://localhost:3004
export ANTHROPIC_API_KEY=e2e-local-dummy-key
export E2E_SIGNIN_RATE_MAX=100
export TENANT_APEX_DOMAIN=localhost
export SEED_OWNER_EMAIL=owner@e2e.local
export SEED_OWNER_PASSWORD='E2eOwnerPass123!'
export SEED_TENANT_B_SLUG=e2e-tenant-b
export SEED_TENANT_B_NAME='E2E Second Workspace'
export SEED_TENANT_B_OWNER_EMAIL=owner-b@e2e.local
export SEED_TENANT_B_OWNER_PASSWORD='E2eOwnerBPass123!'

echo "==> applying migrations"
pnpm exec prisma migrate deploy

echo "==> seeding two tenants"
pnpm db:seed
pnpm db:seed:tenant-b

echo "==> granting the seeded Owner the platform plane"
PLATFORM_ADMIN_USER_IDS="$(NODE_OPTIONS=--conditions=react-server \
  pnpm exec tsx scripts/print-user-id.ts "$SEED_OWNER_EMAIL" | tail -1)"
export PLATFORM_ADMIN_USER_IDS
echo "    owner id: ${PLATFORM_ADMIN_USER_IDS}"

echo "==> running the suite"
pnpm exec playwright test "$@" || suite_failed=1
node scripts/e2e-report.mjs || true
exit "${suite_failed:-0}"
