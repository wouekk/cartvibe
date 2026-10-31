// Command celllint runs the celllint analyzer. Run it from api/: `celllint ./...`.
// Exit status 3 means findings; api/scripts/cell-lint.sh turns that into a report while the lint is
// not yet required.
package main

import (
	"cartvibe/api/tools/celllint"

	"golang.org/x/tools/go/analysis/singlechecker"
)

func main() {
	singlechecker.Main(celllint.Analyzer)
}
