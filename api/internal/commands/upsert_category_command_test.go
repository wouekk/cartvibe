package commands

import (
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpsertCategoryCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command UpsertCategoryCommand
	}{
		"valid with name only": {
			command: UpsertCategoryCommand{
				Name: "Test Category",
			},
		},
		"valid with name and description": {
			command: UpsertCategoryCommand{
				Name:        "Test Category",
				Description: "A description",
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

func TestUpsertCategoryCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command       UpsertCategoryCommand
		expectedError string
	}{
		"missing name": {
			command:       UpsertCategoryCommand{},
			expectedError: "name",
		},
		"empty name": {
			command: UpsertCategoryCommand{
				Name: "",
			},
			expectedError: "name",
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

			if vErr.Errors["name"] != "Name is required" {
				utils.PrintTestError(t, vErr.Errors["name"], "Name is required")
			}
		})
	}
}
