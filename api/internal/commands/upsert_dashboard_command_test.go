package commands

import (
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpsertDashboardCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command UpsertDashboardCommand
	}{
		"valid with name and groupId": {
			command: UpsertDashboardCommand{
				Name:    "My Dashboard",
				GroupId: "1",
			},
		},
		"valid with widgets": {
			command: UpsertDashboardCommand{
				Name:    "My Dashboard",
				GroupId: "1",
				Widgets: []UpsertWidgetCommand{},
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

func TestUpsertDashboardCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command       UpsertDashboardCommand
		expectedError string
	}{
		"missing name": {
			command: UpsertDashboardCommand{
				GroupId: "1",
			},
			expectedError: "name",
		},
		"missing groupId": {
			command: UpsertDashboardCommand{
				Name: "My Dashboard",
			},
			expectedError: "groupId",
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

func TestUpsertDashboardCommand_Validate_MultipleErrors(t *testing.T) {
	command := UpsertDashboardCommand{}

	vErr := command.Validate()

	if len(vErr.Errors) != 2 {
		utils.PrintTestError(t, len(vErr.Errors), 2)
	}

	if _, exists := vErr.Errors["name"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "name")
	}

	if _, exists := vErr.Errors["groupId"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "groupId")
	}
}
