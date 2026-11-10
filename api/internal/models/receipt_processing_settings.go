package models

import (
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
)

type ReceiptProcessingSettings struct {
	BaseModel
	Name                      string       `gorm:"not null; uniqueIndex" json:"name"`
	Description               string       `json:"description"`
	AiType                    AiClientType `json:"aiType"`
	Url                       string       `json:"url"`
	Key                       string       `json:"-"`
	Model                     string       `json:"model"`
	OcrEngine                 *OcrEngine   `json:"ocrEngine"`
	IsVisionModel             bool         `json:"isVisionModel"`
	EnforceJsonResponseFormat bool         `gorm:"default:true" json:"enforceJsonResponseFormat"`
	// ContextSize is Ollama's num_ctx, in tokens: how much of the prompt (the receipt, the category list) the model
	// keeps. 0 leaves Ollama's own default, which is a few thousand and cuts a long receipt short without a word.
	ContextSize int `gorm:"not null;default:0" json:"contextSize"`
}

func (ReceiptProcessingSettings *ReceiptProcessingSettings) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &ReceiptProcessingSettings)
	if err != nil {
		return err
	}

	return nil
}
