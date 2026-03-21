package commands

import (
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpsertSystemEmailCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command  UpsertSystemEmailCommand
		isCreate bool
	}{
		"valid create with all fields": {
			command: UpsertSystemEmailCommand{
				Host:     "imap.example.com",
				Port:     "993",
				Username: "user@example.com",
				Password: "password123",
			},
			isCreate: true,
		},
		"valid update without password": {
			command: UpsertSystemEmailCommand{
				Host:     "imap.example.com",
				Port:     "993",
				Username: "user@example.com",
			},
			isCreate: false,
		},
		"valid update with password": {
			command: UpsertSystemEmailCommand{
				Host:     "imap.example.com",
				Port:     "993",
				Username: "user@example.com",
				Password: "password123",
			},
			isCreate: false,
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate(test.isCreate)

			if len(vErr.Errors) > 0 {
				utils.PrintTestError(t, len(vErr.Errors), 0)
			}
		})
	}
}

func TestUpsertSystemEmailCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command       UpsertSystemEmailCommand
		isCreate      bool
		expectedError string
	}{
		"missing host": {
			command: UpsertSystemEmailCommand{
				Port:     "993",
				Username: "user@example.com",
				Password: "password123",
			},
			isCreate:      true,
			expectedError: "host",
		},
		"missing port": {
			command: UpsertSystemEmailCommand{
				Host:     "imap.example.com",
				Username: "user@example.com",
				Password: "password123",
			},
			isCreate:      true,
			expectedError: "port",
		},
		"missing username": {
			command: UpsertSystemEmailCommand{
				Host:     "imap.example.com",
				Port:     "993",
				Password: "password123",
			},
			isCreate:      true,
			expectedError: "username",
		},
		"missing password on create": {
			command: UpsertSystemEmailCommand{
				Host:     "imap.example.com",
				Port:     "993",
				Username: "user@example.com",
			},
			isCreate:      true,
			expectedError: "password",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate(test.isCreate)

			if len(vErr.Errors) == 0 {
				utils.PrintTestError(t, len(vErr.Errors), "greater than 0")
			}

			if _, exists := vErr.Errors[test.expectedError]; !exists {
				utils.PrintTestError(t, "error should exist for field", test.expectedError)
			}
		})
	}
}

func TestUpsertSystemEmailCommand_Validate_PasswordNotRequiredOnUpdate(t *testing.T) {
	command := UpsertSystemEmailCommand{
		Host:     "imap.example.com",
		Port:     "993",
		Username: "user@example.com",
	}

	vErr := command.Validate(false)

	if len(vErr.Errors) != 0 {
		utils.PrintTestError(t, len(vErr.Errors), 0)
	}
}

func TestUpsertSystemEmailCommand_Validate_MultipleErrors(t *testing.T) {
	command := UpsertSystemEmailCommand{}

	vErr := command.Validate(true)

	if len(vErr.Errors) != 4 {
		utils.PrintTestError(t, len(vErr.Errors), 4)
	}
}
