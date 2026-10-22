package commands

import (
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
	"strings"
)

// GeminiModelsCommand names the key to list models for: either a key typed on the AI page that is not saved yet, or
// the id of saved settings whose stored (encrypted) key is used.
type GeminiModelsCommand struct {
	Key                         string `json:"key"`
	ReceiptProcessingSettingsId uint   `json:"receiptProcessingSettingsId"`
}

func (command *GeminiModelsCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, command)
}

func (command *GeminiModelsCommand) Validate() structs.ValidatorError {
	vErrs := structs.ValidatorError{Errors: map[string]string{}}

	if strings.TrimSpace(command.Key) == "" && command.ReceiptProcessingSettingsId == 0 {
		vErrs.Errors["key"] = "Enter an API key or choose saved settings."
	}

	return vErrs
}
