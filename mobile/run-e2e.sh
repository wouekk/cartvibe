#!/usr/bin/env bash
# Runs the Flutter integration_test suite against the Linux desktop target.
#
# Usage:
#   cd mobile && ./run-e2e.sh               # all tests in integration_test/
#   cd mobile && ./run-e2e.sh integration_test/smoke_login_test.dart
#
# Requires:
#   - flutter on PATH with `linux` desktop enabled
#       (flutter config --enable-linux-desktop)
#   - Go API running locally on :8081 (cd api && go run main.go)
#   - The two e2e users seeded against the local DB (see mobile/CLAUDE.md)
#
# Env vars (sourced from api/dev/switch-to-sqlite.sh if available):
#   E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD, E2E_USER_USERNAME, E2E_USER_PASSWORD
#   E2E_MOBILE_BASE_URL (optional) — the API base URL the app hits. Defaults to
#     http://localhost:8081/api. The desktop suite's E2E_BASE_URL points at
#     the Angular dev server (:4200 via proxy), which the mobile app cannot
#     use — hence the separate variable.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

env_script="../api/dev/switch-to-sqlite.sh"
if [[ -f "$env_script" ]]; then
  # shellcheck disable=SC1090
  source "$env_script"
fi

: "${E2E_ADMIN_USERNAME:?set E2E_ADMIN_USERNAME or source api/dev/switch-to-sqlite.sh}"
: "${E2E_ADMIN_PASSWORD:?set E2E_ADMIN_PASSWORD or source api/dev/switch-to-sqlite.sh}"
: "${E2E_USER_USERNAME:?set E2E_USER_USERNAME or source api/dev/switch-to-sqlite.sh}"
: "${E2E_USER_PASSWORD:?set E2E_USER_PASSWORD or source api/dev/switch-to-sqlite.sh}"

mobile_base_url="${E2E_MOBILE_BASE_URL:-http://localhost:8081/api}"

tmp_env="$(mktemp --suffix=.json)"
trap 'rm -f "$tmp_env"' EXIT

cat > "$tmp_env" <<EOF
{
  "E2E_BASE_URL": "$mobile_base_url",
  "E2E_ADMIN_USERNAME": "$E2E_ADMIN_USERNAME",
  "E2E_ADMIN_PASSWORD": "$E2E_ADMIN_PASSWORD",
  "E2E_USER_USERNAME": "$E2E_USER_USERNAME",
  "E2E_USER_PASSWORD": "$E2E_USER_PASSWORD"
}
EOF

target="${*:-integration_test/}"

# Flutter desktop apps need a display. If DISPLAY isn't set and xvfb-run is
# available, run the test under Xvfb so it works headlessly (containers, CI).
runner=()
if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null 2>&1; then
  runner=(xvfb-run -a)
fi

# shellcheck disable=SC2086
"${runner[@]}" flutter test $target -d linux --dart-define-from-file="$tmp_env"
