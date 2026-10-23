package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
	"strings"
)

// AiModelsCommand names the provider and the key to list models for: either a key typed on the AI page that is not
// saved yet, or the id of saved settings whose stored (encrypted) key is used. An empty aiType is the saved settings'
// provider, or Gemini.
type AiModelsCommand struct {
	AiType                      models.AiClientType `json:"aiType"`
	Key                         string              `json:"key"`
	ReceiptProcessingSettingsId uint                `json:"receiptProcessingSettingsId"`
}

func (command *AiModelsCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, command)
}

func (command *AiModelsCommand) Validate() structs.ValidatorError {
	vErrs := structs.ValidatorError{Errors: map[string]string{}}

	if strings.TrimSpace(command.Key) == "" && command.ReceiptProcessingSettingsId == 0 {
		vErrs.Errors["key"] = "Enter an API key or choose saved settings."
	}

	if command.AiType != "" && command.AiType != models.GEMINI_NEW && command.AiType != models.ANTHROPIC &&
		command.AiType != models.OPEN_AI_NEW {
		vErrs.Errors["aiType"] = "Models can be listed for Claude, Gemini and ChatGPT only."
	}

	return vErrs
}
