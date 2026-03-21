package commands

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestCheckReceiptProcessingSettingsCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command CheckReceiptProcessingSettingsCommand
	}{
		"valid with ID only": {
			command: CheckReceiptProcessingSettingsCommand{
				ID: 1,
			},
		},
		"valid with settings": {
			command: CheckReceiptProcessingSettingsCommand{
				UpsertReceiptProcessingSettingsCommand: UpsertReceiptProcessingSettingsCommand{
					Name:          "Test Settings",
					AiType:        models.OPEN_AI_NEW,
					Key:           "test-key",
					IsVisionModel: true,
					PromptId:      1,
				},
			},
		},
		"valid with ID and settings": {
			command: CheckReceiptProcessingSettingsCommand{
				ID: 1,
				UpsertReceiptProcessingSettingsCommand: UpsertReceiptProcessingSettingsCommand{
					Name:          "Test Settings",
					AiType:        models.OPEN_AI_NEW,
					Key:           "test-key",
					IsVisionModel: true,
					PromptId:      1,
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

func TestCheckReceiptProcessingSettingsCommand_Validate_BothEmpty(t *testing.T) {
	command := CheckReceiptProcessingSettingsCommand{}

	vErr := command.Validate()

	if len(vErr.Errors) != 1 {
		utils.PrintTestError(t, len(vErr.Errors), 1)
	}

	if _, exists := vErr.Errors["command"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "command")
	}

	if vErr.Errors["command"] != "Command and ID cannot be empty." {
		utils.PrintTestError(t, vErr.Errors["command"], "Command and ID cannot be empty.")
	}
}

func TestCheckReceiptProcessingSettingsCommand_Validate_SettingsWithValidationErrors(t *testing.T) {
	command := CheckReceiptProcessingSettingsCommand{
		UpsertReceiptProcessingSettingsCommand: UpsertReceiptProcessingSettingsCommand{
			Name: "Test",
		},
	}

	vErr := command.Validate()

	if len(vErr.Errors) == 0 {
		utils.PrintTestError(t, len(vErr.Errors), "greater than 0")
	}

	// Should have ocrEngine error since IsVisionModel is false and OcrEngine is empty
	if _, exists := vErr.Errors["ocrEngine"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "ocrEngine")
	}
}
