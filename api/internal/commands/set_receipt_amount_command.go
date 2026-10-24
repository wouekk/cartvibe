package commands

import (
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"

	"github.com/shopspring/decimal"
)

// SetReceiptAmountCommand changes only a receipt's total, e.g. to the sum of its product lines when they
// add up to more than the total that was typed in.
type SetReceiptAmountCommand struct {
	// A pointer so an omitted key is a validation error rather than a zero total.
	Amount *decimal.Decimal `json:"amount"`
}

func (command *SetReceiptAmountCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, command)
}

func (command *SetReceiptAmountCommand) Validate() structs.ValidatorError {
	errors := make(map[string]string)

	if command.Amount == nil {
		errors["amount"] = "Amount is required"
	} else if !command.Amount.IsPositive() {
		errors["amount"] = "Amount must be greater than 0"
	}

	return structs.ValidatorError{Errors: errors}
}
