package commands

import (
	"cartvibe/api/internal/models"
	"encoding/json"
)

type UpsertWidgetCommand struct {
	Name          string            `json:"name"`
	WidgetType    models.WidgetType `json:"widgetType"`
	Configuration json.RawMessage   `json:"configuration"`
}
