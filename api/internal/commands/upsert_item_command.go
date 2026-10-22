package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"github.com/shopspring/decimal"
)

type UpsertItemCommand struct {
	Amount          decimal.Decimal         `json:"amount"`
	ChargedToUserId *uint                   `json:"chargedToUserId"`
	IsTaxed         bool                    `json:"isTaxed"`
	Name            string                  `json:"name"`
	ReceiptId       uint                    `json:"receiptId"`
	Status          models.ItemStatus       `json:"status"`
	Categories      []UpsertCategoryCommand `json:"categories"`
	Tags            []UpsertTagCommand      `json:"tags"`
	LinkedItems     []UpsertItemCommand     `json:"linkedItems"`
}

func (item *UpsertItemCommand) Validate(receiptAmount decimal.Decimal, isCreate bool) structs.ValidatorError {
	errors := make(map[string]string)
	vErr := structs.ValidatorError{}

	if item.Amount.Abs().GreaterThan(receiptAmount.Abs()) {
		errors["amount"] = "Amount cannot be greater than receipt amount"
	}

	if len(item.Name) == 0 {
		errors["name"] = "Name is required"
	}

	if !isCreate {
		if item.ReceiptId == 0 {
			errors["receiptId"] = "Receipt Id is required"
		}
	}

	if len(item.Status) == 0 {
		errors["status"] = "Status is required"
	}

	vErr.Errors = errors
	return vErr
}
