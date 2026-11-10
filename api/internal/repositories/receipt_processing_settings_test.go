package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"testing"
)

// The column is `default:true`; a create with the flag off must not come back on, or an
// OpenAI-compatible server that rejects response_format (LM Studio) fails every call.
func TestCreateReceiptProcessingSettingsKeepsJsonEnforcementOff(t *testing.T) {
	defer TruncateTestDb()


	repository := NewReceiptProcessingSettings(nil)
	created, err := repository.CreateReceiptProcessingSettings(commands.UpsertReceiptProcessingSettingsCommand{
		Name:                      "off",
		AiType:                    models.OPEN_AI_CUSTOM,
		Url:                       "http://lm.local/v1",
		Model:                     "m",
		EnforceJsonResponseFormat: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.EnforceJsonResponseFormat {
		t.Error("returned settings say enforcement is on")
	}

	var stored models.ReceiptProcessingSettings
	GetDB().First(&stored, created.ID)
	if stored.EnforceJsonResponseFormat {
		t.Error("stored settings say enforcement is on")
	}

	on, err := repository.CreateReceiptProcessingSettings(commands.UpsertReceiptProcessingSettingsCommand{
		EnforceJsonResponseFormat: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var storedOn models.ReceiptProcessingSettings
	GetDB().First(&storedOn, on.ID)
	if !storedOn.EnforceJsonResponseFormat {
		t.Error("enforcement turned on should stay on")
	}
}
