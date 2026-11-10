package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/shopspring/decimal"
)

// maxShoppingListItemAmount fits the decimal(10,3) column with room to spare.
var maxShoppingListItemAmount = decimal.NewFromInt(100000)

const maxShoppingListItemAmountDecimals = 3

type UpsertShoppingListItemCommand struct {
	Name string `json:"name"`
	// Amount and Unit say how much to buy (e.g. 1.5 kg). Amount is a pointer so "no amount" (null or
	// omitted) is distinct from zero, which is rejected.
	Amount *decimal.Decimal `json:"amount"`
	Unit   string           `json:"unit"`
	// Quantity is the original free-text field, still accepted for clients that send it.
	Quantity string `json:"quantity"`
	Note     string `json:"note"`
	// ClientId is a key the client makes up for a new item so that sending the same add twice adds one line
	// (models.ShoppingListItem.ClientId). Only an add reads it; an update ignores it.
	ClientId string `json:"clientId"`
}

// isShoppingListItemClientId accepts what a client generates (a UUID, or any short token of letters, digits,
// "-" and "_"). The value is stored and sent back to the whole household, so nothing else is let through.
func isShoppingListItemClientId(clientId string) bool {
	if len(clientId) > models.MaxShoppingListItemClientIdLength {
		return false
	}
	for _, char := range clientId {
		isLetter := (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
		isDigit := char >= '0' && char <= '9'
		if !isLetter && !isDigit && char != '-' && char != '_' {
			return false
		}
	}

	return true
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
	command.Unit = strings.ToLower(strings.TrimSpace(command.Unit))
	command.Quantity = strings.TrimSpace(command.Quantity)
	command.Note = strings.TrimSpace(command.Note)
	command.ClientId = strings.TrimSpace(command.ClientId)

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

	if command.Amount != nil {
		switch {
		case !command.Amount.IsPositive():
			vErr.Errors["amount"] = "Amount must be greater than zero"
		case command.Amount.GreaterThanOrEqual(maxShoppingListItemAmount):
			vErr.Errors["amount"] = fmt.Sprintf("Amount must be less than %s", maxShoppingListItemAmount.String())
		case !command.Amount.Equal(command.Amount.Truncate(maxShoppingListItemAmountDecimals)):
			vErr.Errors["amount"] = fmt.Sprintf("Amount can have at most %d decimal places", maxShoppingListItemAmountDecimals)
		}
	}

	if len(command.Unit) > 0 {
		if !models.IsShoppingListUnit(command.Unit) {
			vErr.Errors["unit"] = "Unit is not supported"
		} else if command.Amount == nil {
			vErr.Errors["unit"] = "A unit needs an amount"
		}
	}

	if utf8.RuneCountInString(command.Quantity) > models.MaxShoppingListItemQuantityLength {
		vErr.Errors["quantity"] = fmt.Sprintf("Quantity must be %d characters or fewer", models.MaxShoppingListItemQuantityLength)
	}

	if utf8.RuneCountInString(command.Note) > models.MaxShoppingListItemNoteLength {
		vErr.Errors["note"] = fmt.Sprintf("Note must be %d characters or fewer", models.MaxShoppingListItemNoteLength)
	}

	if !isShoppingListItemClientId(command.ClientId) {
		vErr.Errors["clientId"] = fmt.Sprintf("Client id must be %d letters, digits, hyphens or underscores at most", models.MaxShoppingListItemClientIdLength)
	}

	return vErr
}

// HasAmount reports whether the command says how much to buy, in either form.
func (command UpsertShoppingListItemCommand) HasAmount() bool {
	return command.Amount != nil || len(command.Quantity) > 0
}

func (command *UpsertShoppingListItemCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
