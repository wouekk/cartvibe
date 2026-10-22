package commands

import (
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
)

type UpsertCategoryCommand struct {
	Id          *uint  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Skipped     bool   `json:"skipped"`
}

func (category *UpsertCategoryCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
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

func (category *UpsertCategoryCommand) Validate() structs.ValidatorError {
	errors := make(map[string]string)
	vErr := structs.ValidatorError{}

	if len(category.Name) == 0 {
		errors["name"] = "Name is required"
	}

	vErr.Errors = errors
	return vErr
}
