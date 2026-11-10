package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
	"strings"
)

// MaxAiContextSize bounds ContextSize: more than any model takes, and small enough to be a typing mistake's guard.
const MaxAiContextSize = 1 << 20

type UpsertReceiptProcessingSettingsCommand struct {
	Name                      string              `json:"name"`
	Description               string              `json:"description"`
	AiType                    models.AiClientType `json:"aiType"`
	Url                       string              `json:"url"`
	Key                       string              `json:"key"`
	Model                     string              `json:"model"`
	IsVisionModel             bool                `json:"isVisionModel"`
	EnforceJsonResponseFormat bool                `json:"enforceJsonResponseFormat"`
	OcrEngine                 models.OcrEngine    `json:"ocrEngine"`
	// ContextSize is Ollama's num_ctx in tokens; 0 leaves the model server's default.
	ContextSize int `json:"contextSize"`
}

func (command *UpsertReceiptProcessingSettingsCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	return nil
}

func (command *UpsertReceiptProcessingSettingsCommand) Validate(updateKey bool) structs.ValidatorError {
	vErrs := structs.ValidatorError{}
	errors := map[string]string{}
	vErrs.Errors = errors

	if len(command.Name) == 0 {
		errors["name"] = "name is required"
		return vErrs
	}

	if !command.IsVisionModel && len(command.OcrEngine) == 0 {
		errors["ocrEngine"] = "ocrEngine is required"
		return vErrs
	}

	if len(command.AiType) == 0 {
		errors["type"] = "type is required"
		return vErrs
	}

	if command.AiType == models.OPEN_AI_NEW || command.AiType == models.GEMINI_NEW || command.AiType == models.ANTHROPIC {
		if command.Key == "" && updateKey {
			errors["key"] = "key is required"
		}

		// No model is assumed for a person: models are billed by the token at very different prices.
		if strings.TrimSpace(command.Model) == "" {
			errors["model"] = "model is required"
		}

		if command.Url != "" {
			errors["url"] = "url is not required"
		}
	}

	if command.ContextSize < 0 || command.ContextSize > MaxAiContextSize {
		errors["contextSize"] = "contextSize must be between 0 and 1048576"
	}

	if command.AiType == models.OPEN_AI_CUSTOM_NEW || command.AiType == models.OLLAMA {
		if len(command.Url) == 0 {
			errors["url"] = "url is required"
		}
	}

	return vErrs
}

func (command *UpsertReceiptProcessingSettingsCommand) IsEmpty() bool {
	return command.Name == "" &&
		command.Description == "" &&
		command.AiType == "" &&
		command.Url == "" &&
		command.Key == "" &&
		command.Model == "" &&
		!command.IsVisionModel &&
		!command.EnforceJsonResponseFormat &&
		command.ContextSize == 0 &&
		command.OcrEngine == ""
}
