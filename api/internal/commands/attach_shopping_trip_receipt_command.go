package commands

import (
	"encoding/json"
	"net/http"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// AttachShoppingTripReceiptCommand attaches an existing receipt to a shopping list.
type AttachShoppingTripReceiptCommand struct {
	ReceiptId uint `json:"receiptId"`
}

func (command *AttachShoppingTripReceiptCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, &command)
}

func (command AttachShoppingTripReceiptCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{Errors: make(map[string]string)}

	if command.ReceiptId == 0 {
		vErr.Errors["receiptId"] = "Receipt is required"
	}

	return vErr
}

func (command *AttachShoppingTripReceiptCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
