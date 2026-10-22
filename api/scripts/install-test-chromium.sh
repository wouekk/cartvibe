#!/usr/bin/env bash
# Installs Chromium (Playwright's headless shell) for the API's HTML-to-PDF tests, which drive a real browser
# through chromedp (services/html_to_pdf.go). Uses the repo's own pinned Playwright, so run `npm ci` in desktop/
# once first.
#
#   ./scripts/install-test-chromium.sh        # then: ./scripts/test-pdf.sh
#
# The browser goes to $PLAYWRIGHT_BROWSERS_PATH, default ~/tools/ms-playwright, NOT Playwright's usual
# AppData\Local\ms-playwright: the Claude desktop app runs in a Windows package sandbox that redirects AppData,
# and a Chromium started from the redirected copy fails ("side-by-side configuration is incorrect").
# Run from api/.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
desktop="$here/../../desktop"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/tools/ms-playwright}"

# Node: the PATH one, else the portable Node 20.19.6 the Windows PC keeps in ~/tools (HANDOFF.md, local stack).
if ! command -v npx >/dev/null 2>&1; then
  for candidate in "$HOME/tools/node-v20.19.6-win-x64" "$HOME/tools/node-v20.19.6-darwin-arm64/bin"; do
    if [ -x "$candidate/npx" ] || [ -f "$candidate/npx.cmd" ]; then
      export PATH="$candidate:$PATH"
      break
    fi
  done
fi
command -v npx >/dev/null 2>&1 || { echo "npx not found: install Node 20.19.6 (see HANDOFF.md)" >&2; exit 1; }

if [ ! -d "$desktop/node_modules/@playwright/test" ]; then
  echo "desktop/node_modules has no Playwright: run 'npm ci' in desktop/ first" >&2
  exit 1
fi

mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
echo "Installing Chromium headless shell into $PLAYWRIGHT_BROWSERS_PATH ..."
(cd "$desktop" && npx playwright install --only-shell chromium)

"$here/test-pdf.sh" --print-path
