package commands

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestPieChartDataCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command PieChartDataCommand
	}{
		"valid CATEGORIES grouping": {
			command: PieChartDataCommand{
				ChartGrouping: models.CHART_GROUPING_CATEGORIES,
			},
		},
		"valid TAGS grouping": {
			command: PieChartDataCommand{
				ChartGrouping: models.CHART_GROUPING_TAGS,
			},
		},
		"valid PAIDBY grouping": {
			command: PieChartDataCommand{
				ChartGrouping: models.CHART_GROUPING_PAIDBY,
			},
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()

			if len(vErr.Errors) > 0 {
				utils.PrintTestError(t, len(vErr.Errors), 0)
			}
		})
	}
}

func TestPieChartDataCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command       PieChartDataCommand
		expectedError string
	}{
		"empty chart grouping": {
			command:       PieChartDataCommand{},
			expectedError: "chartGrouping",
		},
		"invalid chart grouping": {
			command: PieChartDataCommand{
				ChartGrouping: "INVALID",
			},
			expectedError: "chartGrouping",
		},
		"lowercase categories": {
			command: PieChartDataCommand{
				ChartGrouping: "categories",
			},
			expectedError: "chartGrouping",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()

			if len(vErr.Errors) == 0 {
				utils.PrintTestError(t, len(vErr.Errors), "greater than 0")
			}

			if _, exists := vErr.Errors[test.expectedError]; !exists {
				utils.PrintTestError(t, "error should exist for field", test.expectedError)
			}
		})
	}
}
