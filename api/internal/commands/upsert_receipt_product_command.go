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

	"github.com/shopspring/decimal"
)

// maxReceiptProductAmount fits the decimal(10,2) column with room to spare.
var maxReceiptProductAmount = decimal.NewFromInt(100000000)

// UpsertReceiptProductCommand is a person's own entry of a receipt product line (Phase 3 C5): to fix
// what the AI read, or to add a line it missed. Amount is nil when the line has no price.
//
// CategoryId and TagIds are the line's category (nil = Uncategorized) and tags. An update replaces both
// with what is sent, so the desktop always sends the line's current values.
type UpsertReceiptProductCommand struct {
	Name       string           `json:"name"`
	Amount     *decimal.Decimal `json:"amount"`
	Quantity   string           `json:"quantity"`
	CategoryId *uint            `json:"categoryId"`
	TagIds     []uint           `json:"tagIds"`
}

func (command *UpsertReceiptProductCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
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
	command.TagIds = uniqueIds(command.TagIds)

	return nil
}

// uniqueIds drops repeats and keeps the order; never nil.
func uniqueIds(ids []uint) []uint {
	seen := make(map[uint]bool, len(ids))
	unique := make([]uint, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	return unique
}

func (command UpsertReceiptProductCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{Errors: make(map[string]string)}

	if len(command.Name) == 0 {
		vErr.Errors["name"] = "Name is required"
	} else if utf8.RuneCountInString(command.Name) > models.MaxReceiptProductNameLength {
		vErr.Errors["name"] = fmt.Sprintf("Name must be %d characters or fewer", models.MaxReceiptProductNameLength)
	}

	if utf8.RuneCountInString(command.Quantity) > models.MaxReceiptProductQuantityLength {
		vErr.Errors["quantity"] = fmt.Sprintf("Quantity must be %d characters or fewer", models.MaxReceiptProductQuantityLength)
	}

	if command.Amount != nil {
		switch {
		case command.Amount.Abs().GreaterThanOrEqual(maxReceiptProductAmount):
			vErr.Errors["amount"] = fmt.Sprintf("Amount must be less than %s", maxReceiptProductAmount.String())
		case !command.Amount.Equal(command.Amount.Truncate(2)):
			vErr.Errors["amount"] = "Amount can have at most 2 decimal places"
		}
	}

	return vErr
}

func (command *UpsertReceiptProductCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
