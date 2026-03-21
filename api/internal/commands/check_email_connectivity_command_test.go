package commands

import (
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestCheckEmailConnectivityCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command CheckEmailConnectivityCommand
	}{
		"valid with ID only": {
			command: CheckEmailConnectivityCommand{
				ID: 1,
			},
		},
		"valid with full credentials": {
			command: CheckEmailConnectivityCommand{
				UpsertSystemEmailCommand: UpsertSystemEmailCommand{
					Host:     "imap.example.com",
					Port:     "993",
					Username: "user@example.com",
					Password: "password123",
				},
			},
		},
		"valid with ID and partial credentials": {
			command: CheckEmailConnectivityCommand{
				ID: 1,
				UpsertSystemEmailCommand: UpsertSystemEmailCommand{
					Host: "imap.example.com",
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

func TestCheckEmailConnectivityCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command         CheckEmailConnectivityCommand
		expectedError   string
		expectedMessage string
	}{
		"all empty": {
			command:         CheckEmailConnectivityCommand{},
			expectedError:   "command",
			expectedMessage: "Command cannot be empty.",
		},
		"no ID with partial credentials": {
			command: CheckEmailConnectivityCommand{
				UpsertSystemEmailCommand: UpsertSystemEmailCommand{
					Host: "imap.example.com",
					Port: "993",
				},
			},
			expectedError:   "command",
			expectedMessage: "If ID is not provided, full credentials must be provided",
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

			if vErr.Errors[test.expectedError] != test.expectedMessage {
				utils.PrintTestError(t, vErr.Errors[test.expectedError], test.expectedMessage)
			}
		})
	}
}
