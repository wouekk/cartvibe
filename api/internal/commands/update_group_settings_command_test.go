package commands

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpdateGroupSettingsCommand_Validate_ValidInputs(t *testing.T) {
	systemEmailId := uint(1)
	paidById := uint(1)
	promptId := uint(1)

	tests := map[string]struct {
		command UpdateGroupSettingsCommand
	}{
		"valid with email integration enabled": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled:     true,
				SystemEmailId:               &systemEmailId,
				EmailDefaultReceiptStatus:   models.ReceiptStatus("OPEN"),
				EmailDefaultReceiptPaidById: &paidById,
			},
		},
		"valid without email integration": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled: false,
			},
		},
		"valid with prompt ids": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled: false,
				PromptId:                &promptId,
				FallbackPromptId:        &promptId,
			},
		},
		"valid with email whitelist": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled: false,
				EmailWhiteList: []models.GroupSettingsWhiteListEmail{
					{Email: "user@example.com"},
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

func TestUpdateGroupSettingsCommand_Validate_EmailIntegrationErrors(t *testing.T) {
	paidByZero := uint(0)

	tests := map[string]struct {
		command       UpdateGroupSettingsCommand
		expectedError string
	}{
		"missing system email id": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled:     true,
				EmailDefaultReceiptStatus:   models.ReceiptStatus("OPEN"),
				EmailDefaultReceiptPaidById: ptrUint(1),
			},
			expectedError: "systemEmailId",
		},
		"missing default receipt status": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled:     true,
				SystemEmailId:               ptrUint(1),
				EmailDefaultReceiptPaidById: ptrUint(1),
			},
			expectedError: "emailDefaultReceiptStatus",
		},
		"nil paid by id": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled:   true,
				SystemEmailId:             ptrUint(1),
				EmailDefaultReceiptStatus: models.ReceiptStatus("OPEN"),
			},
			expectedError: "emailDefaultReceiptPaidById",
		},
		"zero paid by id": {
			command: UpdateGroupSettingsCommand{
				EmailIntegrationEnabled:     true,
				SystemEmailId:               ptrUint(1),
				EmailDefaultReceiptStatus:   models.ReceiptStatus("OPEN"),
				EmailDefaultReceiptPaidById: &paidByZero,
			},
			expectedError: "emailDefaultReceiptPaidById",
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

func TestUpdateGroupSettingsCommand_Validate_PromptIdErrors(t *testing.T) {
	zeroId := uint(0)

	tests := map[string]struct {
		command       UpdateGroupSettingsCommand
		expectedError string
	}{
		"invalid prompt id": {
			command: UpdateGroupSettingsCommand{
				PromptId: &zeroId,
			},
			expectedError: "promptId",
		},
		"invalid fallback prompt id": {
			command: UpdateGroupSettingsCommand{
				FallbackPromptId: &zeroId,
			},
			expectedError: "fallbackPromptId",
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

func TestUpdateGroupSettingsCommand_Validate_InvalidEmailWhiteList(t *testing.T) {
	command := UpdateGroupSettingsCommand{
		EmailWhiteList: []models.GroupSettingsWhiteListEmail{
			{Email: "not-an-email"},
		},
	}

	vErr := command.Validate()

	if _, exists := vErr.Errors["emailWhiteList.0.email"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "emailWhiteList.0.email")
	}
}

func TestUpdateGroupSettingsCommand_Validate_MultipleInvalidEmails(t *testing.T) {
	command := UpdateGroupSettingsCommand{
		EmailWhiteList: []models.GroupSettingsWhiteListEmail{
			{Email: "valid@example.com"},
			{Email: "bad-email"},
			{Email: "also-bad"},
		},
	}

	vErr := command.Validate()

	if _, exists := vErr.Errors["emailWhiteList.0.email"]; exists {
		utils.PrintTestError(t, "valid email should not produce error", nil)
	}

	if _, exists := vErr.Errors["emailWhiteList.1.email"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "emailWhiteList.1.email")
	}

	if _, exists := vErr.Errors["emailWhiteList.2.email"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "emailWhiteList.2.email")
	}
}

func ptrUint(v uint) *uint {
	return &v
}
