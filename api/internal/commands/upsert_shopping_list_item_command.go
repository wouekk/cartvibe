package commands

import (
	"encoding/json"
	"fmt"
	"net/http"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strings"
	"unicode/utf8"
)

type UpsertShoppingListItemCommand struct {
	Name     string `json:"name"`
	Quantity string `json:"quantity"`
	Note     string `json:"note"`
}

func (command *UpsertShoppingListItemCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	command.Name = strings.TrimSpace(command.Name)
	command.Quantity = strings.TrimSpace(command.Quantity)
	command.Note = strings.TrimSpace(command.Note)

	return nil
}

func (command UpsertShoppingListItemCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{
		Errors: make(map[string]string),
	}

	if len(command.Name) == 0 {
		vErr.Errors["name"] = "Name is required"
	} else if utf8.RuneCountInString(command.Name) > models.MaxShoppingListItemNameLength {
		vErr.Errors["name"] = fmt.Sprintf("Name must be %d characters or fewer", models.MaxShoppingListItemNameLength)
	}

	if utf8.RuneCountInString(command.Quantity) > models.MaxShoppingListItemQuantityLength {
		vErr.Errors["quantity"] = fmt.Sprintf("Quantity must be %d characters or fewer", models.MaxShoppingListItemQuantityLength)
	}

	if utf8.RuneCountInString(command.Note) > models.MaxShoppingListItemNoteLength {
		vErr.Errors["note"] = fmt.Sprintf("Note must be %d characters or fewer", models.MaxShoppingListItemNoteLength)
	}

	return vErr
}

func (command *UpsertShoppingListItemCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
