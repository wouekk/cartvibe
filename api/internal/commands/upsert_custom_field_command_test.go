package commands

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpsertCustomFieldCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command UpsertCustomFieldCommand
	}{
		"valid TEXT type": {
			command: UpsertCustomFieldCommand{
				Name: "Test Field",
				Type: models.TEXT,
			},
		},
		"valid DATE type": {
			command: UpsertCustomFieldCommand{
				Name: "Test Field",
				Type: models.DATE,
			},
		},
		"valid SELECT with options": {
			command: UpsertCustomFieldCommand{
				Name: "Test Field",
				Type: models.SELECT,
				Options: []UpsertCustomFieldOptionCommand{
					{Value: "Option 1"},
				},
			},
		},
		"valid CURRENCY type": {
			command: UpsertCustomFieldCommand{
				Name: "Test Field",
				Type: models.CURRENCY,
			},
		},
		"valid BOOLEAN type": {
			command: UpsertCustomFieldCommand{
				Name: "Test Field",
				Type: models.BOOLEAN,
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

func TestUpsertCustomFieldCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command       UpsertCustomFieldCommand
		expectedError string
	}{
		"missing name": {
			command: UpsertCustomFieldCommand{
				Type: models.TEXT,
			},
			expectedError: "name",
		},
		"missing type": {
			command: UpsertCustomFieldCommand{
				Name: "Test Field",
			},
			expectedError: "type",
		},
		"SELECT without options": {
			command: UpsertCustomFieldCommand{
				Name: "Test Field",
				Type: models.SELECT,
			},
			expectedError: "options",
		},
		"SELECT with empty options": {
			command: UpsertCustomFieldCommand{
				Name:    "Test Field",
				Type:    models.SELECT,
				Options: []UpsertCustomFieldOptionCommand{},
			},
			expectedError: "options",
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

func TestUpsertCustomFieldCommand_Validate_MultipleErrors(t *testing.T) {
	command := UpsertCustomFieldCommand{}

	vErr := command.Validate()

	if len(vErr.Errors) != 2 {
		utils.PrintTestError(t, len(vErr.Errors), 2)
	}

	if _, exists := vErr.Errors["name"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "name")
	}

	if _, exists := vErr.Errors["type"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "type")
	}
}
