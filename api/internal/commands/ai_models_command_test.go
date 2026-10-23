package commands

import (
	"cartvibe/api/internal/models"
	"testing"
)

func TestAiModelsCommand_Validate(t *testing.T) {
	cases := []struct {
		name     string
		command  AiModelsCommand
		errorKey string
	}{
		{"a typed key", AiModelsCommand{Key: "abc"}, ""},
		{"saved settings", AiModelsCommand{ReceiptProcessingSettingsId: 3}, ""},
		{"claude", AiModelsCommand{AiType: models.ANTHROPIC, Key: "abc"}, ""},
		{"chatgpt", AiModelsCommand{AiType: models.OPEN_AI_NEW, Key: "abc"}, ""},
		{"gemini", AiModelsCommand{AiType: models.GEMINI_NEW, Key: "abc"}, ""},
		{"nothing", AiModelsCommand{}, "key"},
		{"a blank key and no settings", AiModelsCommand{Key: "   "}, "key"},
		{"a local server has no list", AiModelsCommand{AiType: models.OPEN_AI_CUSTOM_NEW, Key: "abc"}, "aiType"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := tc.command.Validate()
			if tc.errorKey == "" && len(errs.Errors) > 0 {
				t.Fatalf("expected valid, got %v", errs.Errors)
			}
			if tc.errorKey != "" && errs.Errors[tc.errorKey] == "" {
				t.Fatalf("expected a %s error, got %v", tc.errorKey, errs.Errors)
			}
		})
	}
}
