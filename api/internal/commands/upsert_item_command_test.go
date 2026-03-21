package commands

import (
	"github.com/shopspring/decimal"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpsertItemCommand_Validate_ValidInputs(t *testing.T) {
	receiptAmount := decimal.NewFromFloat(100.00)

	tests := map[string]struct {
		command  UpsertItemCommand
		isCreate bool
	}{
		"valid create": {
			command: UpsertItemCommand{
				Amount: decimal.NewFromFloat(50.00),
				Name:   "Test Item",
				Status: models.ITEM_OPEN,
			},
			isCreate: true,
		},
		"valid update": {
			command: UpsertItemCommand{
				Amount:    decimal.NewFromFloat(50.00),
				Name:      "Test Item",
				ReceiptId: 1,
				Status:    models.ITEM_OPEN,
			},
			isCreate: false,
		},
		"amount equals receipt amount": {
			command: UpsertItemCommand{
				Amount: decimal.NewFromFloat(100.00),
				Name:   "Test Item",
				Status: models.ITEM_OPEN,
			},
			isCreate: true,
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate(receiptAmount, test.isCreate)

			if len(vErr.Errors) > 0 {
				utils.PrintTestError(t, len(vErr.Errors), 0)
			}
		})
	}
}

func TestUpsertItemCommand_Validate_InvalidInputs(t *testing.T) {
	receiptAmount := decimal.NewFromFloat(100.00)

	tests := map[string]struct {
		command       UpsertItemCommand
		isCreate      bool
		expectedError string
	}{
		"zero amount": {
			command: UpsertItemCommand{
				Amount: decimal.Zero,
				Name:   "Test Item",
				Status: models.ITEM_OPEN,
			},
			isCreate:      true,
			expectedError: "amount",
		},
		"negative amount": {
			command: UpsertItemCommand{
				Amount: decimal.NewFromFloat(-5.00),
				Name:   "Test Item",
				Status: models.ITEM_OPEN,
			},
			isCreate:      true,
			expectedError: "amount",
		},
		"amount exceeds receipt amount": {
			command: UpsertItemCommand{
				Amount: decimal.NewFromFloat(150.00),
				Name:   "Test Item",
				Status: models.ITEM_OPEN,
			},
			isCreate:      true,
			expectedError: "amount",
		},
		"missing name": {
			command: UpsertItemCommand{
				Amount: decimal.NewFromFloat(50.00),
				Status: models.ITEM_OPEN,
			},
			isCreate:      true,
			expectedError: "name",
		},
		"missing receipt id on update": {
			command: UpsertItemCommand{
				Amount: decimal.NewFromFloat(50.00),
				Name:   "Test Item",
				Status: models.ITEM_OPEN,
			},
			isCreate:      false,
			expectedError: "receiptId",
		},
		"missing status": {
			command: UpsertItemCommand{
				Amount: decimal.NewFromFloat(50.00),
				Name:   "Test Item",
			},
			isCreate:      true,
			expectedError: "status",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate(receiptAmount, test.isCreate)

			if len(vErr.Errors) == 0 {
				utils.PrintTestError(t, len(vErr.Errors), "greater than 0")
			}

			if _, exists := vErr.Errors[test.expectedError]; !exists {
				utils.PrintTestError(t, "error should exist for field", test.expectedError)
			}
		})
	}
}

func TestUpsertItemCommand_Validate_MultipleErrors(t *testing.T) {
	command := UpsertItemCommand{}

	vErr := command.Validate(decimal.NewFromFloat(100.00), false)

	if len(vErr.Errors) < 3 {
		utils.PrintTestError(t, len(vErr.Errors), "at least 3")
	}

	if _, exists := vErr.Errors["amount"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "amount")
	}

	if _, exists := vErr.Errors["name"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "name")
	}

	if _, exists := vErr.Errors["status"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "status")
	}

	if _, exists := vErr.Errors["receiptId"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "receiptId")
	}
}
