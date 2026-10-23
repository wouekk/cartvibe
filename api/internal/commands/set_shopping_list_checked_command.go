package commands

import (
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
)

// SetShoppingListCheckedCommand moves a whole list (or the listed items of it) to the TARGET checked
// state: "Mark as complete" crosses everything off, "Restore" and Undo cross it back on.
type SetShoppingListCheckedCommand struct {
	// A pointer so an omitted key is a validation error rather than silently un-checking the list.
	IsChecked *bool `json:"isChecked"`
	// Omitted means every item on the list; ids of items on other lists are ignored.
	ItemIds []uint `json:"itemIds"`
}

func (command *SetShoppingListCheckedCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, &command)
}

func (command SetShoppingListCheckedCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{
		Errors: make(map[string]string),
	}

	if command.IsChecked == nil {
		vErr.Errors["isChecked"] = "Is checked is required"
	}

	return vErr
}

func (command *SetShoppingListCheckedCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
