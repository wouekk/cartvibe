package commands

import (
	"encoding/json"
	"net/http"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// SetReceiptProductLabelsCommand sets a product line's category and tags and nothing else, so picking
// them never counts as renaming the line (which would send it back to be classified).
type SetReceiptProductLabelsCommand struct {
	// CategoryId nil is Uncategorized.
	CategoryId *uint  `json:"categoryId"`
	TagIds     []uint `json:"tagIds"`
}

func (command *SetReceiptProductLabelsCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	command.TagIds = uniqueIds(command.TagIds)

	return nil
}

func (command SetReceiptProductLabelsCommand) Validate() structs.ValidatorError {
	return structs.ValidatorError{Errors: make(map[string]string)}
}

func (command *SetReceiptProductLabelsCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
