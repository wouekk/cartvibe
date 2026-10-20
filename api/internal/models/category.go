package models

import (
	"encoding/json"
	"net/http"
	"receipt-wrangler/api/internal/utils"
)

type Category struct {
	BaseModel
	Name        string `gorm:"not null; uniqueIndex" json:"name"`
	Description string `json:"description"`
	// Skipped tells the AI never to use this category (Phase 3 feedback); products it would have got fall
	// back to Uncategorized.
	Skipped bool `gorm:"not null;default:false" json:"skipped"`
	// Aliases are the names this category had before it was renamed, one per line. The prompt says to use
	// the new name instead of each, and an AI answer that still uses an old name lands on this category.
	Aliases string `gorm:"type:text" json:"aliases"`
}

func (category *Category) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &category)
	if err != nil {
		return err
	}

	return nil
}
