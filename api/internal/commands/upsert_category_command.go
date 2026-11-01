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

// UnmarshalJSON also takes a bare number as the category id ("categories":[4]): the receipt prompt asks for
// [{"id":4}], and a model now and then answers with the ids alone, which would otherwise fail the whole read.
func (category *UpsertCategoryCommand) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}

	var id uint
	if err := json.Unmarshal(data, &id); err == nil {
		*category = UpsertCategoryCommand{Id: &id}
		return nil
	}

	type plain UpsertCategoryCommand
	var object plain
	if err := json.Unmarshal(data, &object); err != nil {
		return err
	}
	*category = UpsertCategoryCommand(object)
	return nil
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
