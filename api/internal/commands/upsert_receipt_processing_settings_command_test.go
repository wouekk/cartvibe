package commands

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpsertReceiptProcessingSettingsCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command   UpsertReceiptProcessingSettingsCommand
		updateKey bool
	}{
		"valid OPEN_AI with key and vision model": {
			command: UpsertReceiptProcessingSettingsCommand{
				Name:          "Test",
				AiType:        models.OPEN_AI_NEW,
				Key:           "test-key",
				IsVisionModel: true,
				PromptId:      1,
			},
			updateKey: true,
		},
		"valid GEMINI with key and vision model": {
			command: UpsertReceiptProcessingSettingsCommand{
				Name:          "Test",
				AiType:        models.GEMINI_NEW,
				Key:           "test-key",
				IsVisionModel: true,
				PromptId:      1,
			},
			updateKey: true,
		},
		"valid OLLAMA with url and ocr engine": {
			command: UpsertReceiptProcessingSettingsCommand{
				Name:      "Test",
				AiType:    models.OLLAMA,
				Url:       "http://localhost:11434",
				OcrEngine: models.TESSERACT_NEW,
				PromptId:  1,
			},
			updateKey: true,
		},
		"valid OPEN_AI_CUSTOM with url and ocr engine": {
			command: UpsertReceiptProcessingSettingsCommand{
				Name:      "Test",
				AiType:    models.OPEN_AI_CUSTOM_NEW,
				Url:       "http://custom-endpoint.com",
				OcrEngine: models.TESSERACT_NEW,
				PromptId:  1,
			},
			updateKey: true,
		},
		"valid OPEN_AI without key when updateKey is false": {
			command: UpsertReceiptProcessingSettingsCommand{
				Name:          "Test",
				AiType:        models.OPEN_AI_NEW,
				IsVisionModel: true,
				PromptId:      1,
			},
			updateKey: false,
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate(test.updateKey)

			if len(vErr.Errors) > 0 {
				utils.PrintTestError(t, len(vErr.Errors), 0)
			}
		})
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_MissingName(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		AiType:        models.OPEN_AI_NEW,
		Key:           "test-key",
		IsVisionModel: true,
		PromptId:      1,
	}

	vErr := command.Validate(true)

	if len(vErr.Errors) != 1 {
		utils.PrintTestError(t, len(vErr.Errors), 1)
	}

	if _, exists := vErr.Errors["name"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "name")
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_MissingOcrEngineNonVisionModel(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		Name:          "Test",
		AiType:        models.OLLAMA,
		Url:           "http://localhost:11434",
		IsVisionModel: false,
		PromptId:      1,
	}

	vErr := command.Validate(true)

	if _, exists := vErr.Errors["ocrEngine"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "ocrEngine")
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_VisionModelSkipsOcrEngine(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		Name:          "Test",
		AiType:        models.OPEN_AI_NEW,
		Key:           "test-key",
		IsVisionModel: true,
		PromptId:      1,
	}

	vErr := command.Validate(true)

	if _, exists := vErr.Errors["ocrEngine"]; exists {
		utils.PrintTestError(t, "ocrEngine error should not exist for vision model", nil)
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_MissingAiType(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		Name:          "Test",
		IsVisionModel: true,
		PromptId:      1,
	}

	vErr := command.Validate(true)

	if _, exists := vErr.Errors["type"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "type")
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_PromptIdZero(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		Name:          "Test",
		IsVisionModel: true,
		PromptId:      0,
	}

	vErr := command.Validate(true)

	if _, exists := vErr.Errors["promptId"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "promptId")
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_OpenAiMissingKeyWhenUpdateKey(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		Name:          "Test",
		AiType:        models.OPEN_AI_NEW,
		IsVisionModel: true,
		PromptId:      1,
	}

	vErr := command.Validate(true)

	if _, exists := vErr.Errors["key"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "key")
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_OpenAiUrlNotRequired(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		Name:          "Test",
		AiType:        models.OPEN_AI_NEW,
		Key:           "test-key",
		Url:           "http://unnecessary-url.com",
		IsVisionModel: true,
		PromptId:      1,
	}

	vErr := command.Validate(true)

	if _, exists := vErr.Errors["url"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "url")
	}
}

func TestUpsertReceiptProcessingSettingsCommand_Validate_OllamaMissingUrl(t *testing.T) {
	command := UpsertReceiptProcessingSettingsCommand{
		Name:      "Test",
		AiType:    models.OLLAMA,
		OcrEngine: models.TESSERACT_NEW,
		PromptId:  1,
	}

	vErr := command.Validate(true)

	if _, exists := vErr.Errors["url"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "url")
	}
}

func TestUpsertReceiptProcessingSettingsCommand_IsEmpty(t *testing.T) {
	tests := map[string]struct {
		command  UpsertReceiptProcessingSettingsCommand
		expected bool
	}{
		"empty command": {
			command:  UpsertReceiptProcessingSettingsCommand{},
			expected: true,
		},
		"name set": {
			command:  UpsertReceiptProcessingSettingsCommand{Name: "Test"},
			expected: false,
		},
		"promptId set": {
			command:  UpsertReceiptProcessingSettingsCommand{PromptId: 1},
			expected: false,
		},
		"isVisionModel set": {
			command:  UpsertReceiptProcessingSettingsCommand{IsVisionModel: true},
			expected: false,
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			result := test.command.IsEmpty()

			if result != test.expected {
				utils.PrintTestError(t, result, test.expected)
			}
		})
	}
}
