#!/usr/bin/env bash
# Roll the ATS containers onto one revision. Invoked by the deploy workflow's host hook with the
# full commit SHA; safe to run by hand for a rollback (pass the previous SHA).
#
# Scoped to the `destaworks` compose project throughout. Nothing here addresses any other stack on
# the host by name or by wildcard: no bare `docker compose down`, no `system prune`, no daemon
# restart. A second project on the same daemon must be able to ignore this script entirely.
set -euo pipefail

REF="${1:-}"
[ -n "$REF" ] || { echo "usage: rollout.sh <full-commit-sha>" >&2; exit 2; }
[[ "$REF" =~ ^[0-9a-f]{40}$ ]] || { echo "refusing: '$REF' is not a full 40-char SHA" >&2; exit 2; }

COMPOSE=/srv/destaworks/shared/docker-compose.remote.yml
PREV_FILE=/srv/destaworks/shared/CURRENT_REF
PREV="$(cat "$PREV_FILE" 2>/dev/null || echo none)"

echo "rolling out $REF (previous: $PREV)"

# Pull first, start second. A pull that fails leaves the running containers untouched, so a bad tag
# or an expired registry credential is a no-op rather than an outage.
REF="$REF" docker compose -f "$COMPOSE" pull
REF="$REF" docker compose -f "$COMPOSE" up -d --remove-orphans

# `up -d` returns once the containers are created, which is not the same as the API being able to
# serve. Poll readiness — it checks the database too, so an unapplied migration fails here rather
# than in front of a user.
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 http://127.0.0.1:4004/health 2>/dev/null | grep -q '"ok":true'; then
    echo "$REF" > "$PREV_FILE"
    echo "healthy on $REF"
    exit 0
  fi
  sleep 5
done

echo "ERROR: $REF did not become healthy within 5 minutes" >&2
echo "roll back with: $0 $PREV" >&2
exit 1
