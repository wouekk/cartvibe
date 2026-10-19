package commands

import (
	"encoding/json"
	"net/http"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
)

// SetShoppingListItemCheckedCommand carries the TARGET checked state rather than a toggle, so two
// devices tapping the same item at once converge instead of cancelling each other out.
type SetShoppingListItemCheckedCommand struct {
	// A pointer so an omitted key is a validation error rather than silently un-checking the item.
	IsChecked *bool `json:"isChecked"`
}

func (command *SetShoppingListItemCheckedCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, &command)
}

func (command SetShoppingListItemCheckedCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{
		Errors: make(map[string]string),
	}

	if command.IsChecked == nil {
		vErr.Errors["isChecked"] = "Is checked is required"
	}

	return vErr
}

func (command *SetShoppingListItemCheckedCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
