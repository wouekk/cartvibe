#!/usr/bin/env bash
# Runs the API's HTML-to-PDF tests (report PDFs, the file:// and SSRF guards) against the Chromium that
# install-test-chromium.sh put in $PLAYWRIGHT_BROWSERS_PATH (default ~/tools/ms-playwright). Run from api/.
#
#   ./scripts/test-pdf.sh                    # the PDF tests
#   ./scripts/test-pdf.sh -run Render_Basic  # extra `go test` flags are passed on
#   ./scripts/test-pdf.sh --print-path       # only print the browser it would use
#
# It goes through go-without-cgo.sh, so the PDF tests that need ImageMagick (PDF rasterizing, file type
# sniffing, AI image encoding) still fail on a machine without it; only CI or the Docker image proves those.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
browsers="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/tools/ms-playwright}"

if [ -z "${CHROMIUM_BINARY_PATH:-}" ]; then
  CHROMIUM_BINARY_PATH="$(find "$browsers" -maxdepth 3 -type f \
    \( -name 'chrome-headless-shell.exe' -o -name 'chrome-headless-shell' \) 2>/dev/null | sort | tail -1)"
fi
if [ -z "$CHROMIUM_BINARY_PATH" ] || [ ! -f "$CHROMIUM_BINARY_PATH" ]; then
  echo "No Chromium headless shell under $browsers: run ./scripts/install-test-chromium.sh first" >&2
  exit 1
fi
export CHROMIUM_BINARY_PATH

if [ "${1:-}" = "--print-path" ]; then
  echo "CHROMIUM_BINARY_PATH=$CHROMIUM_BINARY_PATH"
  exit 0
fi

# Go is not on the bash PATH on the Windows PC.
if ! command -v go >/dev/null 2>&1 && [ -x "/c/Program Files/Go/bin/go.exe" ]; then
  export PATH="$PATH:/c/Program Files/Go/bin"
fi

# Ghostscript lets the file:// and SSRF guard tests read the rendered PDF's text; without it those checks skip.
# Windows names it gswin64c.exe, the tests look for `gs`, so a one-line shim bridges the two.
if ! command -v gs >/dev/null 2>&1; then
  gswin="$(ls -d "/c/Program Files/gs"/gs*/bin/gswin64c.exe 2>/dev/null | sort | tail -1 || true)"
  if [ -n "$gswin" ]; then
    shim="$(mktemp -d)"
    trap 'rm -rf "$shim"' EXIT
    printf '#!/bin/sh\nexec "%s" "$@"\n' "$gswin" > "$shim/gs"
    chmod +x "$shim/gs"
    export PATH="$shim:$PATH"
  else
    echo "Ghostscript not found: the guard tests' text checks will skip (Windows: winget install ArtifexSoftware.GhostScript)"
  fi
fi

echo "Using $CHROMIUM_BINARY_PATH"
"$here/go-without-cgo.sh" test ./internal/services/ -count=1 \
  -run 'HtmlToPdf|IsRequestAllowed|Generate_PdfDocument' "$@"
