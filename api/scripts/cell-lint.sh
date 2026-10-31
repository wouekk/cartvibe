#!/usr/bin/env bash
# Runs the cell lint (tools/celllint) over the API. REPORT-ONLY: findings are printed and counted, and the
# script exits 0, so CI is never failed by them. Set CELL_LINT_ENFORCE=1 to exit non-zero on any finding
# (the switch to flip once the repositories are migrated; see docs/cell-runtime.md).
#
# Optional arguments are package patterns (default ./...).
# Needs the same toolchain as `go build ./...` (cgo libraries included), because the lint type-checks the
# packages. A load or build failure exits non-zero in either mode: a broken lint must not look clean.
set -uo pipefail

cd "$(dirname "$0")/.."

bin="$(mktemp -d)/celllint"
trap 'rm -rf "$(dirname "$bin")"' EXIT

(cd tools/celllint && go build -o "$bin" ./cmd/celllint) || { echo "cell-lint: could not build the analyzer" >&2; exit 2; }

report="$(mktemp)"
trap 'rm -rf "$(dirname "$bin")" "$report"' EXIT

"$bin" "${@:-./...}" >"$report" 2>&1
status=$?

# singlechecker exits 3 when it printed findings; any other non-zero status is a tool failure.
if [ "$status" -ne 0 ] && [ "$status" -ne 3 ]; then
	cat "$report" >&2
	echo "cell-lint: the analyzer failed (exit $status)" >&2
	exit "$status"
fi

cat "$report"

echo
echo "cell-lint summary (all files / non-test files):"
for category in global-db gorm-open get-db; do
	all=$(grep -c "\[$category\]" "$report")
	production=$(grep "\[$category\]" "$report" | grep -vc "_test.go")
	printf '  %-10s %4d / %d\n' "$category" "$all" "$production"
done

total=$(grep -c "\[[a-z-]*\]" "$report")
if [ "$total" -gt 0 ] && [ "${CELL_LINT_ENFORCE:-0}" = "1" ]; then
	echo "cell-lint: $total finding(s), CELL_LINT_ENFORCE=1" >&2
	exit 1
fi

echo "cell-lint: report-only, $total finding(s), not failing the build"
exit 0
