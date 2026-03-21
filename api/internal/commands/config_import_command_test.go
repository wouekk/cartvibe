package commands

import (
	"mime/multipart"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestConfigImportCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command ConfigImportCommand
	}{
		"valid with file header": {
			command: ConfigImportCommand{
				FileHeader: &multipart.FileHeader{
					Filename: "config.json",
				},
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

func TestConfigImportCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command       ConfigImportCommand
		expectedError string
	}{
		"nil file header": {
			command:       ConfigImportCommand{},
			expectedError: "file",
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

			if vErr.Errors["file"] != "File cannot be empty" {
				utils.PrintTestError(t, vErr.Errors["file"], "File cannot be empty")
			}
		})
	}
}
