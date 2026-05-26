#!/usr/bin/env bash
# Runs the Flutter integration_test suite against a local Android emulator.
#
# Usage:
#   cd mobile && ./run-e2e-android.sh                                 # all tests
#   cd mobile && ./run-e2e-android.sh integration_test/smoke_login_test.dart
#
# Auto-attaches to a running emulator, or boots $E2E_ANDROID_AVD if none is up.
# Runs one `flutter drive` per spec (same shape as .github/workflows/mobile-e2e.yml).
# The emulator is left running on exit for faster reruns -- close it manually
# (adb emu kill) for a cold boot next time.
#
# Requires:
#   - flutter on PATH (or installed under ~/Documents/flutter/bin, auto-discovered)
#   - Android SDK at $ANDROID_HOME / $ANDROID_SDK_ROOT / ~/Library/Android/sdk
#   - At least one AVD created via Android Studio or `avdmanager`
#   - coreutils on PATH for `gtimeout` (brew install coreutils)
#   - Go API running locally on :8081 (cd api && go run main.go)
#   - The two e2e users seeded (see mobile/CLAUDE.md "Prerequisites")
#
# Env vars (sourced from api/dev/switch-to-sqlite.sh if present):
#   E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD, E2E_USER_USERNAME, E2E_USER_PASSWORD
#
# Overrides:
#   E2E_ANDROID_AVD       AVD name (default: Pixel_3a_API_34_extension_level_7_arm64-v8a)
#   E2E_MOBILE_BASE_URL   API base URL the app hits (default: http://10.0.2.2:8081/api;
#                         10.0.2.2 is the Android emulator's alias for the host loopback)

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

# --- locate flutter ----------------------------------------------------------
if ! command -v flutter >/dev/null 2>&1; then
  for candidate in "$HOME/Documents/flutter/bin" "$HOME/flutter/bin" "/opt/flutter/bin" "/usr/local/flutter/bin"; do
    if [[ -x "$candidate/flutter" ]]; then
      export PATH="$candidate:$PATH"
      break
    fi
  done
fi
command -v flutter >/dev/null 2>&1 || { echo "flutter not on PATH" >&2; exit 1; }

# --- locate Android SDK ------------------------------------------------------
android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [[ ! -d "$android_sdk" ]]; then
  echo "Android SDK not found at $android_sdk (set ANDROID_HOME)" >&2
  exit 1
fi
export ANDROID_HOME="$android_sdk"
export ANDROID_SDK_ROOT="$android_sdk"
export PATH="$android_sdk/platform-tools:$android_sdk/emulator:$PATH"

command -v adb >/dev/null 2>&1 || { echo "adb not under $android_sdk/platform-tools" >&2; exit 1; }
command -v emulator >/dev/null 2>&1 || { echo "emulator not under $android_sdk/emulator" >&2; exit 1; }
command -v gtimeout >/dev/null 2>&1 || { echo "gtimeout not found; brew install coreutils" >&2; exit 1; }

# --- credentials -------------------------------------------------------------
env_script="../api/dev/switch-to-sqlite.sh"
if [[ -f "$env_script" ]]; then
  # shellcheck disable=SC1090
  source "$env_script"
fi
: "${E2E_ADMIN_USERNAME:?set E2E_ADMIN_USERNAME or source api/dev/switch-to-sqlite.sh}"
: "${E2E_ADMIN_PASSWORD:?set E2E_ADMIN_PASSWORD or source api/dev/switch-to-sqlite.sh}"
: "${E2E_USER_USERNAME:?set E2E_USER_USERNAME or source api/dev/switch-to-sqlite.sh}"
: "${E2E_USER_PASSWORD:?set E2E_USER_PASSWORD or source api/dev/switch-to-sqlite.sh}"

mobile_base_url="${E2E_MOBILE_BASE_URL:-http://10.0.2.2:8081/api}"
avd_name="${E2E_ANDROID_AVD:-Pixel_3a_API_34_extension_level_7_arm64-v8a}"

# --- boot or attach emulator -------------------------------------------------
adb start-server >/dev/null 2>&1 || true

current_serial="$(adb devices | awk '/^emulator-[0-9]+\tdevice$/ {print $1; exit}')"
if [[ -z "$current_serial" ]]; then
  echo "==> No emulator attached; booting AVD: $avd_name"
  if ! emulator -list-avds 2>/dev/null | grep -Fxq "$avd_name"; then
    echo "AVD '$avd_name' not found. Available AVDs:" >&2
    emulator -list-avds >&2 || true
    echo "Set E2E_ANDROID_AVD or create an AVD via Android Studio." >&2
    exit 1
  fi
  emulator_log="/tmp/run-e2e-android-emulator-$$.log"
  nohup emulator -avd "$avd_name" -no-snapshot-save -no-boot-anim \
    >"$emulator_log" 2>&1 &
  echo "    emulator log: $emulator_log"

  echo "==> Waiting for adb device..."
  adb wait-for-device
  current_serial="$(adb devices | awk '/^emulator-[0-9]+\tdevice$/ {print $1; exit}')"
  if [[ -z "$current_serial" ]]; then
    echo "Emulator started but did not appear in 'adb devices'." >&2
    exit 1
  fi

  echo "==> Waiting for sys.boot_completed on $current_serial (up to 5 min)..."
  boot_deadline=$((SECONDS + 300))
  until [[ "$(adb -s "$current_serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    if (( SECONDS > boot_deadline )); then
      echo "Emulator failed to finish booting within 5 minutes." >&2
      exit 1
    fi
    sleep 2
  done

  # Animations off: matches CI's `disable-animations: true`, avoids flake on
  # widget-find pumps that race UI transitions.
  for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb -s "$current_serial" shell settings put global "$setting" 0 >/dev/null 2>&1 || true
  done
else
  echo "==> Using already-running emulator: $current_serial"
fi

# --- ensure dependencies resolved -------------------------------------------
# The per-spec `flutter drive` invocations pass --no-pub (faster reruns, matches
# CI). CI runs `flutter pub get` as a prior step; locally we need to do it
# ourselves once so .dart_tool/package_config.json has integration_test mapped
# -- otherwise the first build fails with
# "Couldn't resolve the package 'integration_test'".
echo "==> flutter pub get"
flutter pub get

# --- dart-define payload -----------------------------------------------------
tmp_env="$(mktemp -t run-e2e-android.XXXXXX).json"
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

# --- target specs ------------------------------------------------------------
if [[ $# -gt 0 ]]; then
  targets=("$@")
else
  targets=()
  while IFS= read -r spec; do targets+=("$spec"); done \
    < <(find integration_test -maxdepth 2 -name '*_test.dart' | sort)
fi
if [[ ${#targets[@]} -eq 0 ]]; then
  echo "No *_test.dart files found under integration_test/" >&2
  exit 1
fi

# --- per-spec drive loop -----------------------------------------------------
# One `flutter drive` invocation per spec. main.dart's top-level GoRouter is a
# final global -- its location persists across testWidgets in the same flutter
# process, so spec N+1 inherits spec N's last URL and 403s on bootstrap.
#
# Between specs: force-stop + uninstall io.receiptwrangler, pkill -f dartvm.
# flutter drive's own cleanup uninstalls by namespace
# (com.example.receipt_wrangler_mobile) which doesn't match the real package,
# so without this the prior spec's dart process keeps owning the vmservice
# port and the next spec's launch hangs forever waiting to connect.
# gtimeout 600 caps a hung spec to one failed slot instead of eating the run.
exit_code=0
for target in "${targets[@]}"; do
  echo ""
  echo "==> $target"
  adb -s "$current_serial" shell am force-stop io.receiptwrangler >/dev/null 2>&1 || true
  adb -s "$current_serial" uninstall io.receiptwrangler >/dev/null 2>&1 || true
  pkill -f dartvm >/dev/null 2>&1 || true
  if ! gtimeout 600 flutter drive \
       --no-pub \
       --driver=test_driver/integration_test.dart \
       --target="$target" \
       -d "$current_serial" \
       --dart-define-from-file="$tmp_env"; then
    exit_code=1
  fi
done

exit "$exit_code"
