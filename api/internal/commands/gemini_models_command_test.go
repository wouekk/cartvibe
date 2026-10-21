package commands

import "testing"

func TestGeminiModelsCommand_Validate(t *testing.T) {
	cases := []struct {
		name    string
		command GeminiModelsCommand
		valid   bool
	}{
		{"a typed key", GeminiModelsCommand{Key: "abc"}, true},
		{"saved settings", GeminiModelsCommand{ReceiptProcessingSettingsId: 3}, true},
		{"nothing", GeminiModelsCommand{}, false},
		{"a blank key and no settings", GeminiModelsCommand{Key: "   "}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := tc.command.Validate()
			if tc.valid && len(errs.Errors) > 0 {
				t.Fatalf("expected valid, got %v", errs.Errors)
			}
			if !tc.valid && errs.Errors["key"] == "" {
				t.Fatal("expected a key error")
			}
		})
	}
}
