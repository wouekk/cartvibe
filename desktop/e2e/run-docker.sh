#!/usr/bin/env bash
# Full e2e run against the built image on Docker Desktop (see docs/e2e.md "Running the full suite in Docker").
#   e2e/run-docker.sh up        fresh app container + Valkey + a Playwright runner (run from desktop/)
#   e2e/run-docker.sh run [args] playwright test [args] in the runner (setup project runs every time)
#   e2e/run-docker.sh down
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."
IMAGE=${CARTVIBE_IMAGE:-cartvibe:ci}
case "${1:-}" in
  up)
    docker rm -f cartvibe valkey runner >/dev/null 2>&1 || true
    docker network create e2e >/dev/null 2>&1 || true
    docker run -d --name valkey --network e2e valkey/valkey:9.1-alpine valkey-server --appendonly no >/dev/null
    docker run -d --name cartvibe --network e2e -e TZ=Europe/Paris -e SECRET_KEY=ci-secret-key \
      -e ENCRYPTION_KEY=ci-encryption-key -e DB_ENGINE=sqlite -e DB_FILENAME=app.db "$IMAGE" >/dev/null
    # The runner shares the app's network namespace so the page is on http://localhost (a secure context, like CI).
    docker run -d --name runner --network container:cartvibe \
      -v "$PWD/e2e:/w/e2e" -v "$PWD/playwright.config.ts:/w/playwright.config.ts" \
      -v "$PWD/package.json:/src/package.json:ro" -v "$PWD/package-lock.json:/src/package-lock.json:ro" \
      -e E2E_BASE_URL=http://localhost -e E2E_NO_WEBSERVER=1 -e API_URL=http://localhost \
      -e E2E_USER_USERNAME=e2e-user -e E2E_USER_PASSWORD=e2e-user-password \
      -e E2E_ADMIN_USERNAME=e2e-admin -e E2E_ADMIN_PASSWORD=e2e-admin-password \
      -w /w mcr.microsoft.com/playwright:v1.64.1-noble sleep infinity >/dev/null
    docker exec runner sh -c 'cp /src/package*.json /w/ && cd /w && npm ci --ignore-scripts --no-audit --no-fund >/dev/null'
    for i in $(seq 1 60); do
      docker exec runner curl -fsS http://localhost/api/featureConfig >/dev/null 2>&1 && break
      sleep 2
    done
    docker exec runner node e2e/seed-accounts.mjs
    ;;
  run)
    shift
    docker exec runner sh -c "cd /w && npx playwright test --workers=${E2E_WORKERS:-2} $*"
    ;;
  down)
    docker rm -f cartvibe valkey runner >/dev/null 2>&1 || true
    ;;
  *) echo "usage: $0 up|run [playwright args]|down"; exit 1 ;;
esac
