#!/usr/bin/env bash
# Start or stop the object store the E2E upload specs need.
#
# SeaweedFS, matching staging. The credentials are dummies and the container is disposable; nothing
# here is a secret. `start` is idempotent so a re-run does not fail on an existing container.
#
#   scripts/e2e-storage.sh start
#   scripts/e2e-storage.sh stop
set -euo pipefail

CONTAINER="${E2E_STORAGE_CONTAINER:-desta-ats-e2e-storage}"
PORT="${E2E_STORAGE_PORT:-8333}"
IMAGE="chrislusf/seaweedfs:3.68"

# The identity the app signs with. `actions` must include Admin so the suite can create buckets.
IDENTITIES='{"identities":[{"name":"e2e","credentials":[{"accessKey":"e2e-access-key","secretKey":"e2e-secret-key"}],"actions":["Admin","Read","Write","List","Tagging"]}]}'

# volume.max matters: SeaweedFS allocates volumes PER BUCKET and the default ceiling is low enough
# that a third bucket gets none, failing every write with "no free volumes left" — which the S3
# gateway reports as a bare InternalError. Staging hit exactly that.
start() {
  if [ -n "$(docker ps -q -f "name=^${CONTAINER}$")" ]; then
    echo "object store already running on :${PORT}"
    return 0
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" \
    -p "127.0.0.1:${PORT}:8333" \
    --entrypoint sh \
    "$IMAGE" \
    -c "printf '%s' '${IDENTITIES}' > /tmp/s3.json && exec weed server -s3 -s3.config=/tmp/s3.json -dir=/data -volume.max=32" \
    >/dev/null

  for _ in $(seq 1 45); do
    # An unsigned GET answers 403 because identities are enforced: any HTTP status means it is up.
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:${PORT}/" || true)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      echo "object store ready on :${PORT} (answered ${code})"
      return 0
    fi
    sleep 2
  done

  echo "the object store never answered on :${PORT}. Logs:" >&2
  docker logs --tail 30 "$CONTAINER" >&2 || true
  return 1
}

stop() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "object store removed"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *)
    echo "usage: $0 {start|stop}" >&2
    exit 2
    ;;
esac
