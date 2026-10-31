package celllint_test

import (
	"testing"

	"cartvibe/api/tools/celllint"

	"golang.org/x/tools/go/analysis/analysistest"
)

func TestAnalyzer(t *testing.T) {
	analysistest.Run(t, analysistest.TestData(), celllint.Analyzer,
		"cartvibe/api/internal/repositories",
		"cartvibe/api/internal/handlers",
		"cartvibe/api/internal/cell",
		"cartvibe/api/internal/cell/celltest",
		"cartvibe/api/internal/clean",
	)
}
